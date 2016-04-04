/*! Firebase.getAsArray - v0.1.0 - 2016-04-01
* Copyright (c) 2016 Kato
* MIT LICENSE */

(function(exports) {

  exports.getAsArray = function(ref, eventCallback) {
    return new ReadOnlySynchronizedArray(ref, eventCallback).getList();
  };

  var MIN_PRIORITY_DIFF = 0.00000005;

  function ReadOnlySynchronizedArray(ref, eventCallback) {
    this.list = [];
    this.snaps = {};
    this.subs = []; // used to track event listeners for dispose()
    this.ref = ref;
    this.eventCallback = eventCallback;
    this._wrapList();
    this._initPriorities();
    this._initListeners();
  }

  ReadOnlySynchronizedArray.prototype = {
    getList: function() {
      return this.list;
    },

    add: function(data) {
      var self = this;
      var ref = this.ref.push();
      if (this.list.length !== 0) {
        var priority = this.snaps[this.list[this.list.length - 1].$id].getPriority();

        // set value with priority
        ref.setWithPriority(parseForJson(data), priority + 1, self._handleErrors.bind(self, ref.key()));
      } else {
        ref.setWithPriority(parseForJson(data), 0, this._handleErrors.bind(this, ref.key()));
      }
      return ref;
    },

    set: function(key, newValue) {
      // get current priority so we can set with the same
      // TODO we don't have to support setting non-existent key
      if (!this.snaps.hasOwnProperty(key)) {
        var self = this;
        var ref = this.ref.child(key);
        if (this.list.length !== 0) {
          var priority = this.snaps[this.list[this.list.length - 1].$id].getPriority();

          // set value with priority
          ref.setWithPriority(parseForJson(newValue), priority + 1, self._handleErrors.bind(self, ref.key()));
        } else {
          ref.setWithPriority(parseForJson(newValue), 0, this._handleErrors.bind(this, ref.key()));
        }
      } else {
        var priority = this.snaps[key].getPriority();
        this.ref.child(key).setWithPriority(parseForJson(newValue), priority, this._handleErrors.bind(this, key));
      }
    },

    setAt: function(index, newValue) {
      if (index >= 0 && index < this.list.length) {
        this.set(this.list[index].$id, newValue);
      }
    },

    update: function(key, newValue) {
      // TODO we don't have to support setting non-existent key
      if (!this.snaps.hasOwnProperty(key)) {
        this.set(key, newValue);
      } else {
        this.ref.child(key).update(parseForJson(newValue), this._handleErrors.bind(this, key));
      }
    },

    updateAt: function(index, newValue) {
      if (index >= 0 && index < this.list.length) {
        this.update(this.list[index].$id, newValue);
      }
    },

    setPriority: function(key, newPriority) {
      this.ref.child(key).setPriority(newPriority);
    },

    remove: function(key) {
      this.ref.child(key).remove(this._handleErrors.bind(null, key));
    },

    removeAt: function(index) {
      if (index >= 0 && index < this.list.length) {
        this.remove(this.list[index].$id);
      }
    },

    insert: function(index, newValue) {
      if (this.list.length === 0) {
        return this.add(newValue);
      }

      var ref = this.ref.push();
      if (index === 0) {

        // get priority of first child
        var priority = this.snaps[this.list[0].$id].getPriority();
        // set value with priority
        // TODO do we have to _parseForJson?
        ref.setWithPriority(newValue, priority - 1);
      } else if (index >= this.list.length) {
        // TODO can lump in with first check
        // TODO in fact, we have to, we're returning the wrong ref
        this.add(newValue);
      } else {
        var prevPriority = this.snaps[this.list[index - 1].$id].getPriority();
        var nextPriority = this.snaps[this.list[index].$id].getPriority();

        // if diff is getting small, reset priorities
        if (nextPriority - prevPriority < MIN_PRIORITY_DIFF) {
          var update = {};
          for(var listIndex = 0; listIndex < this.list.length; listIndex++) {
            update[this.list[listIndex].$id+'/.priority'] =
              // skip index we are going to insert at
              ((listIndex >= index) ? listIndex + 1 : listIndex);
          }

          // add value we're inserting
          newValue = parseVal(ref.key(), newValue);
          delete newValue['$id'];
          newValue['.priority'] = index;
          update[ref.key()] = newValue;

          // do update
          this.ref.update(update);
        } else {
          var priority = (prevPriority + nextPriority)/2;

          ref.setWithPriority(newValue, priority);
        }
      }
      return ref;
    },

    move: function(index, destinationIndex) {
      // index has to be a valid current index
      if (index >= 0 && index < this.list.length) {
        // destination has to be at least zero and not equal to index or one more
        if (destinationIndex >= 0 &&
            destinationIndex !== index &&
            destinationIndex !== index + 1) {
          // if moving to end, set priority after current last element
          if (destinationIndex > this.list.length - 1) {
            this.snaps[this.list[index].$id].ref().setPriority(
              this.snaps[this.list[this.list.length - 1].$id].getPriority() + 1
            );
          } else {
            // otherwise, set priority between surrounding elements
            var prevPriority = this.snaps[this.list[destinationIndex - 1].$id].getPriority();
            var nextPriority = this.snaps[this.list[destinationIndex].$id].getPriority();

            // if surrounding priority diff is too small, reset to indices
            if (nextPriority - prevPriority < MIN_PRIORITY_DIFF) {

              // figure out final index of moving element
              var finalIndex;
              if (destinationIndex > index) {
                finalIndex = destinationIndex - 1;
              } else {
                finalindex = destinationIndex;
              }
              var update = {};
              var newIndex = 0;
              for(var listIndex = 0; listIndex < this.list.length; listIndex++) {
                if (listIndex === index) {
                  update[this.list[listIndex].$id+'/.priority'] = finalIndex;
                } else if (listIndex < destinationIndex) {
                  update[this.list[listIndex].$id+'/.priority'] = newIndex;
                  newIndex++;
                } else {
                  update[this.list[listIndex].$id+'/.priority'] = newIndex + 1;
                  newIndex++;
                }
              }

              // do update
              this.ref.update(update);
            } else {
              this.ref.setPriority((prevPriority + nextPriority)/2);
            }
          }
        }
      }
    },

    posByKey: function(key) {
      return findKeyPos(this.list, key);
    },

    placeRecord: function(key, prevId) {
      if( prevId === null ) {
        return 0;
      }
      else {
        var i = this.posByKey(prevId);
        if( i === -1 ) {
          return this.list.length;
        }
        else {
          return i+1;
        }
      }
    },

    getRecord: function(key) {
      var i = this.posByKey(key);
      if( i === -1 ) return null;
      return this.list[i];
    },

    dispose: function() {
      var ref = this.ref;
      this.subs.forEach(function(s) {
        ref.off(s[0], s[1]);
      });
      this.subs = [];
    },

    _serverAdd: function(snap, prevId) {
      this.snaps[snap.key()] = snap;
      var data = parseVal(snap.key(), snap.val());
      this._moveTo(snap.key(), data, prevId);
      this._handleEvent('child_added', snap.key(), data);
    },

    _serverRemove: function(snap) {
      var pos = this.posByKey(snap.key());
      if( pos !== -1 ) {
        this.list.splice(pos, 1);
        this._handleEvent('child_removed', snap.key(), this.list[pos]);
      }
    },

    _serverChange: function(snap) {
      this.snaps[snap.key()] = snap;
      var pos = this.posByKey(snap.key());
      if( pos !== -1 ) {
        this.list[pos] = applyToBase(this.list[pos], parseVal(snap.key(), snap.val()));
        this._handleEvent('child_changed', snap.key(), this.list[pos]);
      }
    },

    _serverMove: function(snap, prevId) {
      var id = snap.key();
      var oldPos = this.posByKey(id);
      if( oldPos !== -1 ) {
        var data = this.list[oldPos];
        this.list.splice(oldPos, 1);
        this._moveTo(id, data, prevId);
        this._handleEvent('child_moved', snap.key(), data);
      }
    },

    _moveTo: function(id, data, prevId) {
      var pos = this.placeRecord(id, prevId);
      this.list.splice(pos, 0, data);
    },

    _handleErrors: function(key, err) {
      if( err ) {
        this._handleEvent('error', null, key);
        console.error(err);
      }
    },

    _handleEvent: function(eventType, recordId, data) {
      this.eventCallback && this.eventCallback(eventType, recordId, data);
    },

    _wrapList: function() {
      this.list.$indexOf = this.posByKey.bind(this);
      this.list.$add = this.add.bind(this);
      this.list.$removeAt = this.removeAt.bind(this);
      this.list.$setAt = this.setAt.bind(this);
      this.list.$updateAt = this.updateAt.bind(this);
      this.list.$rawData = function(key) { return parseForJson(this.getRecord(key)) }.bind(this);
      this.list.$off = this.dispose.bind(this);
      this.list.$insert = this.insert.bind(this);
      this.list.$move = this.move.bind(this);
    },

    _initListeners: function() {
      this._monit('child_added', this._serverAdd);
      this._monit('child_removed', this._serverRemove);
      this._monit('child_changed', this._serverChange);
      this._monit('child_moved', this._serverMove);
    },

    _initPriorities: function() {
      var self = this;
      this.ref.once('value', function(snapshot) {
        // check for existing priorities
        var ordered = true;
        snapshot.forEach(function(childSnap) {
          if (childSnap.getPriority() === null) {
            ordered = false;
          }
        });

        if (!ordered) {
          var update = {};
          var index = 0;
          snapshot.forEach(function(childSnap) {
            update[childSnap.key()+'/.priority'] = index++;
          });
          self.ref.update(update);
        }
      });
    },

    _monit: function(event, method) {
      this.subs.push([event, this.ref.on(event, method.bind(this))]);
    }
  };

  function applyToBase(base, data) {
    // do not replace the reference to objects contained in the data
    // instead, just update their child values
    if( isObject(base) && isObject(data) ) {
      var key;
      for(key in base) {
        if( key !== '$id' && base.hasOwnProperty(key) && !data.hasOwnProperty(key) ) {
          delete base[key];
        }
      }
      for(key in data) {
        if( data.hasOwnProperty(key) ) {
          base[key] = data[key];
        }
      }
      return base;
    }
    else {
      return data;
    }
  }

  function isObject(x) {
    return typeof(x) === 'object' && x !== null;
  }

  function findKeyPos(list, key) {
    for(var i = 0, len = list.length; i < len; i++) {
      if( list[i].$id === key ) {
        return i;
      }
    }
    return -1;
  }

  function parseForJson(data) {
    if( data && typeof(data) === 'object' ) {
      delete data['$id'];
      if( data.hasOwnProperty('.value') ) {
        data = data['.value'];
      }
    }
    if( data === undefined ) {
      data = null;
    }
    return data;
  }

  function parseVal(id, data) {
    if( typeof(data) !== 'object' || !data ) {
      data = { '.value': data };
    }
    data['$id'] = id;
    return data;
  }
})(typeof(window)==='undefined'? exports : window.Firebase);

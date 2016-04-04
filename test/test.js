
var sinon = require('sinon');
var _ = require('lodash');
var expect = require('chai').use(require('sinon-chai')).expect;
var Firebase = require('firebase');
var getAsArray = require('../firebase-as-array').getAsArray;

describe('Firebase.getAsArray', function() {
  var fb;

  describe('#constructor', function() {
    beforeEach(function(done) {
      fb = new Firebase('https://<YOUR FIREBASE>.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        }
      }, done);
    });

    it('should attach functions to array', function() {
      var list = getAsArray(fb);
      expect(list).is.instanceof(Array);
      _.each(['$indexOf', '$add', '$remove', '$update', '$move'], function(fn) {
        expect(list[fn]).is.a('function');
      });
    });

    it('should load initial data', function(done) {
      var list = getAsArray(fb);
      fb.once('value', function(snap, prevChild) {
        var val = snap.val();
        expect(list).to.have.length(_.keys(val).length);
        var i = 0;
        _.each(val, function(v, k) {
          expect(list.$rawData(k)).to.eql(v);
        });
        done();
      });
    });

    it('should handle child_added from server', function() {
      var list = getAsArray(fb);
      var oldLength = list.length;
      fb.child('foo').set({hello: 'world'});
      expect(list).to.have.length(oldLength+1);
    });

    it('should handle child_removed from server', function() {
      var list = getAsArray(fb);
      var oldLength = list.length;
      fb.child('b').remove();
      expect(list).to.have.length(oldLength-1);
    });

    it('should handle child_changed from server', function() {
      var list = getAsArray(fb);
      var data = {hello: 'world'};

      var oldLength = list.length;
      fb.child('b').set(data);

      expect(list).has.length(oldLength);
      expect(list.$rawData('b')).eqls(data);
    });

    it('should handle child_moved from server', function() {
      var list = getAsArray(fb);

      var oldLength = list.length;
      fb.child('a').setPriority(100);

      expect(list).has.length(oldLength);
      expect(list[oldLength-1].$id).eqls('a');
    });

    it('should trigger callback for add', function() {
      var spy = sinon.spy();
      var list = getAsArray(fb, spy);

      var len = list.length;
      expect(len).is.above(0);
      expect(spy.callCount).equals(len);

      fb.push({foo: 'bar'});
      expect(spy.callCount).equals(len+1);
    });

    it('should trigger callback for remove', function() {
      var spy = sinon.spy();
      var list = getAsArray(fb, spy);

      var len = list.length;
      expect(len).is.above(0);
      expect(spy.callCount).equals(len);

      fb.child('a').remove();
      expect(list.length).equals(len-1);
      expect(spy.callCount).equals(len+1);
    });

    it('should trigger callback for change', function() {
      var spy = sinon.spy();
      var list = getAsArray(fb, spy);

      var len = list.length;
      expect(len).is.above(0);
      expect(spy.callCount).equals(len);

      fb.child('a').set({hello: 'world'});

      expect(list.length).equals(len);
      expect(spy.callCount).equals(len+1);
    });

    it('should trigger callback for move', function(done) {
      var spy = sinon.spy();
      var list = getAsArray(fb, spy);

      var len = list.length;
      expect(len).is.above(0);
      expect(spy.callCount).equals(len);

      fb.child('a').setPriority(100, function(error) {
        expect(list.length).equals(len);
        expect(spy.callCount).equals(len+2);
        done();
      });
    });
  });

  describe('$rawData', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        }
      }, done);
    });

    it('should return the same data in Firebase for existing key', function(done) {
      var list = getAsArray(fb);
      fb.child('b').once('value', function(snapshot) {
        var val = snapshot.val();
        expect(list.$rawData('b')).eqls(val);
        done();
      });
    });

    it('should return null for non-existing key', function() {
      var list = getAsArray(fb);
      expect(list.$rawData('notavalidkey')).equals(null);
    })
  });

  describe('$off', function() {
    it('should stop listening to events', function() {
      var list = getAsArray(fb);
      var oldLength = list.length;
      list.$off();
      fb.push({hello: 'world'});
      expect(list.length).equals(oldLength);
    })
  });

  describe('$indexOf', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        }
      }, done);
    });

    it('should return correct index for existing records', function(done) {
      var list = getAsArray(fb);

      var i = 0;
      expect(list.length).is.gt(0);
      fb.once('value', function(snapshot) {
        snapshot.forEach(function(snap) {
          expect(list.$indexOf(snap.key())).equals(i++);
        });
        done();
      });
    });

    it('should return -1 for missing record', function() {
      var list = getAsArray(fb);

      expect(list.length).is.gt(0);
      expect(list.$indexOf('notakey')).equals(-1);
    });
  });

  describe('$add', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set(null, done)
    });

    it('should return a Firebase ref containing the record id', function(done) {
      // var fb = new Firebase('Empty://', {});
      var list = getAsArray(fb);

      expect(list.length).equals(0);
      var ref = list.$add({foo: 'bar'});

      expect(list.$indexOf(ref.key())).equals(0);
      done();
    });

    it('should add primitives', function() {
      var list = getAsArray(fb);

      expect(list.length).equals(0);
      list.$add(true);

      expect(list[0]['.value']).equals(true);
    });

    it('should add objects', function() {
      var list = getAsArray(fb);

      expect(list.length).equals(0);
      var id = list.$add({foo: 'bar'}).key();

      expect(list[0]).eqls({$id: id, foo: 'bar'});
    });

    // TODO how to test with actual server?
    // it('should call Firebase.push() to create a unique id', function() {
    //   var list = getAsArray(fb);
    //
    //   expect(list.length).equals(0);
    //   var ref = list.$add({foo: 'bar'});
    //
    //   expect(ref.key()).equals(fb._lastAutoId);
    // });
  });

  describe('$set', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': 'bar',
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        }
      }, done);
    });

    it('should update existing primitive', function() {
      var list = getAsArray(fb);

      expect(list[1]['.value']).equals('bar');
      list.$set('b', 'baz');

      expect(list[1]['.value']).equals('baz');
    });

    it('should update existing object', function(done) {
      var list = getAsArray(fb);

      fb.child('a').once('value', function(snap) {
        var dat = snap.val();
        dat.test = true;

        list.$set('a', dat);

        expect(list[0].test).equals(true);

        done();
      });
    });

    it('should not replace object references', function() {
      var list = getAsArray(fb);

      var listCopy = list.slice();

      list.$set('a', {test: 'hello'});

      expect(list.length).is.above(0);
      _.each(list, function(item, i) {
        expect(list[i]).equals(listCopy[i]);
      });
    });

    it('should create record if does not exist', function() {
      var list = getAsArray(fb);

      var len = list.length;
      list.$set('notakey', {hello: 'world'});

      expect(list.length).equals(len+1);
      expect(list.$indexOf('notakey')).equals(len);
    });
  });

  describe('$update', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        },
        'foo': 'bar',
        'hello': 'world'
      }, done);
    });

    it('should throw error if passed a primitive', function() {
      var list = getAsArray(fb);

      expect(function() {
        list.$update('foo', true);
      }).to.throw(Error);
    });

    it('should replace a primitive', function() {
      var list = getAsArray(fb);

      list.$update('foo', {hello: 'world'});

      expect(list[3]).eqls({$id: 'foo', hello: 'world'});
    });

    it('should update object', function() {
      var list = getAsArray(fb);

      list.$update('a', {test: true});

      expect(list[0].test).equals(true);
    });

    it('should not affect data that is not part of the update', function() {
      var list = getAsArray(fb);

      var copy = _.assign({}, list[0]);
      list.$update('a', {test: true});

      _.each(copy, function(v,k) {
        expect(list[0][k]).equals(v);
      })
    });

    it('should not replace object references', function() {
      var list = getAsArray(fb);

      var listCopy = list.slice();

      list.$update('a', {test: 'hello'});

      expect(list.length).is.above(0);
      _.each(list, function(item, i) {
        expect(list[i]).equals(listCopy[i]);
      });
    });

    it('should create record if does not exist', function() {
      var list = getAsArray(fb);

      var len = list.length;
      list.$update('notakey', {hello: 'world'});

      expect(list.length).equals(len+1);
      expect(list.$indexOf('notakey')).equals(len);
    });
  });

  describe('$remove', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        },
      }, done);
    });

    it('should remove existing records', function() {
      var list = getAsArray(fb);

      var len = list.length;
      list.$remove('a');

      expect(list.length).equals(len-1);
      expect(list.$indexOf('a')).equals(-1);
    });

    it('should not blow up if record does not exist', function() {
      var list = getAsArray(fb);

      var len = list.length;
      list.$remove('notakey');

      expect(list.length).equals(len);
      expect(list.$indexOf('notakey')).equals(-1);
    });
  });

  describe('$move', function() {

    beforeEach(function(done) {
      fb = new Firebase('https://test-4892.firebaseio.com');
      fb.set({
        'a': {
          hello: 'world',
          aNumber: 1,
          aBoolean: false
        },
        'b': {
          foo: 'bar',
          aNumber: 2,
          aBoolean: true
        },
        'c': {
          bar: 'baz',
          aNumber: 3,
          aBoolean: true
        },
      }, done);
    });

    it('should move existing records', function(done) {
      var list = getAsArray(fb);

      fb.once('value', function(snap) {
        var data = snap.val();
        var keys = _.keys(data);
        keys.push(keys.splice(0, 1)[0]);
        list.$move('a', 100);

        _.each(keys, function(k, i) {
          expect(list.$indexOf(k)).equals(i);
        });

        done();
      });
    });

    it('should not change if record does not exist', function(done) {
      var list = getAsArray(fb);

      fb.once('value', function(snap) {
        var data = snap.val();
        var keys = _.keys(data);
        list.$move('notakey', 100);

        _.each(keys, function(k, i) {
          expect(list.$indexOf(k)).equals(i);
        });

        done();
      });
    });
  });
});

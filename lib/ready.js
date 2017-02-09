'use strict';

const EventEmitter = require('events');
const once = require('once');
const ready = require('get-ready');
const uuid = require('uuid');
const debug = require('debug')('ready-callback');

const defaults = {
  timeout: 10000,
  isWeakDep: false,
};

/**
 * @class Ready
 */
class Ready extends EventEmitter {

  /**
   * @constructor
   * @param  {Object} opt
   *   - {Number} [timeout=10000] - emit `ready_timeout` when it doesn't finish but reach the timeout
   *   - {Boolean} [isWeakDep=false] - whether it's a weak dependency
   */
  constructor(opt) {
    super();
    ready.mixin(this);

    this.opt = opt || {};
    this.isError = false;
    this.cache = new Map();

    setImmediate(() => {
      // fire callback directly when no registered ready callback
      if (this.cache.size === 0) {
        debug('Fire callback directly');
        this.ready(true);
      }
    });
  }

  /**
   * Mix `ready` and `readyCallback` to `obj`
   * @method Ready#mixin
   * @param  {Object} obj - The mixed object
   * @return {Ready} this
   */
  mixin(obj) {
    // only mixin once
    if (!obj || this.obj) return null;

    // delegate API to object
    obj.ready = this.ready.bind(this);
    obj.readyCallback = this.readyCallback.bind(this);

    // only ready once with error
    this.once('error', err => obj.ready(err));

    // delegate events
    if (obj.emit) {
      this.on('ready_timeout', obj.emit.bind(obj, 'ready_timeout'));
      this.on('ready_stat', obj.emit.bind(obj, 'ready_stat'));
      this.on('error', obj.emit.bind(obj, 'error'));
    }
    this.obj = obj;

    return this;
  }

  /**
   * Create a callback, ready won't be fired until all the callbacks are triggered.
   * @method Ready#readyCallback
   * @param  {String} name -
   * @param  {Object} opt - the options that will override global
   * @return {Function} - a callback
   */
  readyCallback(name, opt) {
    opt = Object.assign({}, defaults, this.opt, opt);
    const cacheKey = uuid.v1();
    opt.name = name || cacheKey;
    const timer = setTimeout(() => this.emit('ready_timeout', opt.name), opt.timeout);
    const cb = once(err => {
      clearTimeout(timer);
      // won't continue to fire after it's error
      if (this.isError === true) return;
      // fire callback after all register
      setImmediate(() => this.readyDone(cacheKey, opt, err));
    });
    debug('[%s] Register task id `%s` with %j', cacheKey, opt.name, opt);
    cb.id = opt.name;
    this.cache.set(cacheKey, cb);
    return cb;
  }

  /**
   * resolve ths callback when readyCallback be called
   * @method Ready#readyDone
   * @private
   * @param  {String} id - unique id generated by readyCallback
   * @param  {Object} opt - the options that will override global
   * @param  {Error} err - err passed by ready callback
   * @return {Ready} this
   */
  readyDone(id, opt, err) {
    if (err !== undefined && !opt.isWeakDep) {
      this.isError = true;
      if (!(err instanceof Error)) {
        err = new Error(err);
      }
      debug('[%s] Throw error task id `%s`, error %s', id, opt.name, err);
      return this.emit('error', err);
    }

    debug('[%s] End task id `%s`, error %s', id, opt.name, err);
    this.cache.delete(id);

    this.emit('ready_stat', {
      id: opt.name,
      remain: getRemain(this.cache),
    });

    if (this.cache.size === 0) {
      debug('[%s] Fire callback async', id);
      this.ready(true);
    }
    return this;
  }

}

// Use ready-callback with options
module.exports = opt => new Ready(opt);
module.exports.Ready = Ready;

function getRemain(map) {
  const names = [];
  for (const cb of map.values()) {
    names.push(cb.id);
  }
  return names;
}
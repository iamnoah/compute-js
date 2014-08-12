(function() {
	"use strict";

	var _ = require("./_");

	var uid = 0;
	// Standard Observer pattern.
	function Listeners() {
		this.NS = "__mu_compute_" + (++uid);
		this._keyToId = {};
		this._listeners = {};
		this._ordered = [];
	}

	/**
	 * @param {function()} listener
	 * @param {?String} key optional key. Must be unique.
	 * Can be used to remove the listener without a reference to the 
	 * original function.
	 */
	Listeners.prototype.add = function(listener, key) {
		if (listener[this.NS]) {
			throw new Error("Function is already bound to this compute! " + (key || ""));
		}
		var id = "L" + (++uid);
		if (key) {
			if (this._keyToId[key]) {
				throw new Error("Listener key already in use: " + key);
			}
			this._keyToId[key] = id;
		}
		listener[this.NS] = id;
		this._listeners[id] = listener;
		this._ordered.push(listener);
	};
	Listeners.prototype.remove = function(listener) {
		var id;
		if (typeof listener === "string") {
			id = this._keyToId[listener];
			delete this._keyToId[listener];
		} else {
			id = listener[this.NS];
		}

		if (!id) {
			throw new Error("Tried to remove a non-listener: " + listener);
		}

		var fn = this._listeners[id];
		delete this._listeners[id];
		delete fn[this.NS];
		var index = this._ordered.indexOf(fn);
		if (~index) {
			this._ordered.splice(index, 1);
		}
	};
	Listeners.prototype.notify = function() {
		var args = arguments;
		this._ordered.forEach(function(fn) {
			fn.apply(null, args);
		});
	};
	Object.defineProperties(Listeners.prototype, {
		length: {
			get: function() {
				return this._ordered.length;
			}
		}
	});

	// Helper for monitoring the values getValue requires to compute.
	function Monitor(getValue, record, onWrite, opts) {
		this.id = "M" + (++uid);
		this.get = function() {
			this._value = getValue();
		}.bind(this);
		this.record = record;
		this.onWrite = onWrite;
		this.opts = opts;

		this._dirtyListeners = new Listeners();
		this.onChange = this.onChange.bind(this);
		this.setDirty = this.setDirty.bind(this);
		this.onDirty = this.onDirty.bind(this);
		this.offDirty = this.offDirty.bind(this);
	}
	Monitor.prototype.onDirty = function(fn) {
		this._dirtyListeners.add(fn);
	};
	Monitor.prototype.offDirty = function(fn) {
		this._dirtyListeners.remove(fn);
	};
	Monitor.prototype.setDirty = function() {
		if (!this.dirty) {
			this._dirtyListeners.notify();
		}
		this.dirty = true;
	};
	Monitor.prototype.recompute = function() {
		// record what was accessed
		var oldWatches = this._toWatch || {
			order: [],
			computes: {}
		};
		this.dirty = false;
		this._toWatch = this.record(this.get);

		// update what we are watching
		var oldIds = _.uniq(oldWatches.order);
		var newIds = _.uniq(this._toWatch.order);
		var newWatches = _.difference(newIds, oldIds);
		var rmWatches = _.difference(oldIds, newIds);

		_.each(rmWatches, function(id) {
			var c = oldWatches.computes[id];
			c.offChange(this.onChange);
			if (c.offDirty) {
				c.offDirty(this.setDirty);
			}
		}, this);
		_.each(newWatches, function(id) {
			var c = this._toWatch.computes[id];
			if (c.onDirty) {
				c.onDirty(this.setDirty);
			}
			c.onChange(this.onChange);
		}, this);
	};
	Monitor.prototype.graph = function() {
		var bound = this.bound;
		if (!this._toWatch) {
			this.recompute();
		}
		var watches = this._toWatch;
		var graph = watches.order.reduce(function(deps, id) {
			var graph = {};

			var c = watches.computes[id];

			if (c.graph) {
				graph[id] = {
					name: c.computeName,
					dependencies: c.graph(),
				};
			} else {				
				graph[id] = {
					name: c.computeName,
				};
			}

			return _.extend(graph, deps);
		}, {});
		if (!bound) {
			this.unbind();
		}
		return graph;
	};
	Monitor.prototype.onChange = function() {
		// if dirty, recompute and notify listeners if the result changed
		if (!this.dirty) {
			return;
		}
		var oldVal = this._value;
		this.recompute();
		this.onWrite(oldVal, this._value);
	};
	Monitor.prototype.unbind = function() {
		_.each(_.uniq(this._toWatch.order), function(id) {
			var c = this._toWatch.computes[id];
			c.offChange(this.onChange);
			if (c.offDirty) {
				c.offDirty(this.setDirty);
			}
		}, this);
		this._toWatch = false;
	};
	Object.defineProperties(Monitor.prototype, {
		bound: {
			get: function() {
				return !!this._toWatch;
			}
		},
		value: {
			get: function() {
				this.onChange();
				return this._value;
			},
		},
	});

	// batch of compute updates
	function Batch() {
		this.order = [];
		this.notifications = {};
	}
	Batch.prototype.addChange = function(listeners, oldVal, newVal) {
		var id = listeners.NS;
		this.order.push(id);

		// the first time we see the listeners, save the old value
		var state = this.notifications[id] = this.notifications[id] || {
			listeners: listeners,
			oldVal: oldVal
		};
		// always update the new value
		state.newVal = newVal;
	};
	Batch.prototype.send = function() {
		_.uniq(this.order).forEach(function(id) {
			var state = this.notifications[id];
			if (state.oldVal !== state.newVal) {
				state.listeners.notify(state.oldVal, state.newVal);
			}
		}, this);
	};

	function namespacedGraph(makeGraph, name) {
		if (!makeGraph) {
			return false;
		}
		function namespace(obj) {
			if (obj === true) {
				return obj;
			}
			var result = {};
			_.each(obj, function(value, key) {
				result[name + ":" + key] = namespace(value);
			});
			return result;
		}
		return function() {
			return namespace(makeGraph());
		};
	}

	function Computes() {
		var accessed = function() {};
		var batch, batchDepth;
		var nsId = 0;
		function afterBatch(listeners, oldVal, newVal) {
			if (batch) {
				batch.addChange(listeners, oldVal, newVal);
			} else {
				var b = new Batch();
				b.addChange(listeners, oldVal, newVal);
				b.send();
			}
		}
		function record(fn) {
			// record what computes were accessed while the function ran
			// so we know what to bind to
			var records = {
				// need to record the access order so we can consistently bind/unbind
				order: [],
				computes: {}
			};
			var oldAccessed = accessed;
			accessed = function(compute, id) {
				// if this is one of our computes, monitor it *now* so we are
				// observing just it and not its dependencies
				if (compute.track) {
					compute.track();
				}
				records.order.push(id);
				records.computes[id] = compute;
			};
			connected.reduce(function(fn, connect, i) {
				var prefix = connect.name || ("connect-" + i);
				return function() {
					connect.record(fn, function(compute, id) {
						accessed({
							onChange: compute.onChange,
							offChange: compute.offChange,
							// XXX dirty is just an internal concept, so just 
							// bind a 2nd listener to mark dirty when an extenal
							// compute changes
							onDirty: compute.onChange,
							offDirty: compute.offChange,
							computeName: prefix + ":" + (compute.computeName || id),
							graph: namespacedGraph(compute.graph, prefix),
						}, "connected:" + i + ":" + id);
					});
				};
			}, fn)();
			accessed = oldAccessed;
			return records;
		}
		// Simple observable wrapper around a value.
		function valueCompute(opts) {
			var listeners = new Listeners();
			var dirty = new Listeners();
			var id = "V" + (++nsId);
			var value = opts.value;
			function holder(v) {
				if (arguments.length) {
					return holder.set(v);
				}
				return holder.get();
			}
			holder.cid = id;
			holder.get = function() {
				accessed({
					onChange: holder.onChange,
					offChange: holder.offChange,
					computeName: holder.computeName,
					onDirty: dirty.add.bind(dirty),
					offDirty: dirty.remove.bind(dirty),	
				}, id);
				return value;
			};
			holder.set = function(newVal) {
				var oldVal = value;
				value = newVal;
				dirty.notify();
				afterBatch(listeners, oldVal, newVal);
			};
			holder.onChange = function(listener, key) {
				listeners.add(listener, key);
			};
			holder.offChange = function(listener) {
				listeners.remove(listener);
			};
			holder.__listeners = listeners;

			holder.computeName = "" + (opts.name || value || id);

			return holder;
		}
		// Wraps a computation of value computes.
		function compute(opts) {			
			var listeners = new Listeners();
			var id = "C" + (++nsId);
			function wrapper(newVal) {
				if (arguments.length) {
					return wrapper.set(newVal);
				}
				return wrapper.get();
			}
			var getter = opts.get;
			wrapper.get = function() {
				accessed({
					onChange: wrapper.onChange,
					offChange: wrapper.offChange,
					computeName: wrapper.computeName,
					graph: wrapper.graph,
					track: wrapper.track,
					onDirty: monitor.onDirty,
					offDirty: monitor.offDirty,
				}, id);
				// if currently bound, use the cached value
				return !batch && monitor.bound ? monitor.value :
					getter.call(opts.ctx);
			};

			var setter = opts.set;
			wrapper.set = setter && function(newValue) {
				return setter.call(opts.ctx, newValue);
			};

			wrapper.onChange = function(listener, key) {
				// once we have listeners, we need to monitor any computes
				// our value depends on
				listeners.add(listener, key);
				if (!monitor.bound) {
					monitor.recompute();
				}
			};
			wrapper.offChange = function(listener) {
				listeners.remove(listener);
				if (!listeners.length) {
					monitor.unbind();
				}
			};

			// the monitor is responsible for watching all the computes we use
			// and notifying us when we recompute
			var monitor = new Monitor(function() {
				return getter.call(opts.ctx);
			}, record, function(oldVal, newVal) {
				afterBatch(listeners, oldVal, newVal);
			}, opts);


			wrapper.__listeners = listeners;
			wrapper.__monitor = monitor;
			wrapper.track = function() {
				if (!monitor.bound) {
					monitor.recompute();
				}
			};

			wrapper.cid = id;

			wrapper.computeName = opts.name || opts.get.name || id;

			wrapper.graph = function() {
				return monitor.graph();
			};

			return wrapper;
		}
		function make(c, ctx, name) {
			var opts;
			if (typeof c === "function") {
				opts = {
					get: c,
					set: c,
					ctx: ctx,
					name: name,
				};
				return compute(opts);
			}
			if (typeof c.get === "function" && c.get.length === 0) {
				return compute(c);
			}
			ctx = typeof ctx === "string" ? { name: ctx } : ctx;
			return valueCompute(_.extend({}, ctx || {}, {
				value: c
			}));
		}
		make.value = function(opts) {
			opts = opts && opts.hasOwnProperty("value") ? opts : {
				value: opts,
			};
			return valueCompute(opts);
		};
		make.startBatch = function() {
			batchDepth++;
			batch = batch || new Batch();
		};
		make.endBatch = function() {
			batchDepth--;
			if (batchDepth < 0) {
				throw new Error("No current batch");
			}
			if (!batchDepth) {
				var b = batch;
				// XXX null out batch before sending so computes will notify
				batch = null;
				b.send();
			}
		};

		var connected = [];
		make.connect = function(api) {
			connected.push(api);			
		};

		/**
		 * Debugging helper. Creates a GraphViz graph of the given computes.
		 */
		make.vizualize = function() {
			var nodes = {};
			function flatDeps(graph, depsOf) {
				var keys = Object.keys(graph);
				nodes[depsOf] = nodes[depsOf] || graph.name;
				return _.flatten(keys.map(function(id) {
					var deps = [depsOf + " -> " + id + ";"];
					nodes[id] = nodes[id] || graph[id].name;
					if (graph[id].dependencies) {
						return deps.concat(
							flatDeps(graph[id].dependencies, id));
					}
					return deps;
				}));
			}
			var deps = _.flatten(_.toArray(arguments).map(function(c) {
				nodes[c.cid] = c.computeName;
				return flatDeps(c.graph(), c.cid);
			}));

			deps.sort();
			var nodeNames = Object.keys(nodes).map(function(id) {
				return id + '[label="' + nodes[id] + '\\n(' + id + ')"];';
			}).sort();

			return "strict digraph dependencies {\n" +
				nodeNames.join("\n") + "\n" +
				deps.join("\n") +
			"\n}";
		};

		return make;
	}

	var defaultSpace = new Computes();
	// Can't think of why you would want a separate compute space, but
	// knock yourself out creating them if you like.
	defaultSpace.constructor = Computes;
	module.exports = defaultSpace;
})(this);

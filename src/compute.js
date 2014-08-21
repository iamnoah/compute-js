(function() {
	"use strict";

	var _ = require("./_");
	var Graph = require("./graph");
	var Set = require("./string-collections").Set;

	// batch of compute updates
	function Batch(graph) {
		this.graph = graph;
		this.changed = [];
		this.changes = {};
		this.toNotify = [];
	}
	Batch.prototype.addChange = function(id, oldVal, newVal) {
		this.changed.push(id);
		var change = this.changes[id] = this.changes[id] || {
			oldVal: oldVal,
		};
		change.newVal = newVal;
		// PERF remove changed nodes that didn't actually change value
		// PERF can we lazy recompute somehow if in a batch?
		this.recompute();
	};
	Batch.prototype.recompute = function() {
		var graph = this.graph;

		// To recompute, we start with the value nodes that changed (this.changes)
		// We then have to find all the nodes that are somehow dependent on them.
		// We then get an ordering of all the nodes such that dependencies are
		// recomputed before dependents.
		// At that point, all we have to do is recompute them in order. If we 
		// get to a node that has no dependencies that have changed value, we
		// skip it.
		var toNotify = this.toNotify;
		function recompute(node) {
			if (!graph.node(node).get("isCompute")) {
				// assuming that any node that is not a compute is a listener
				toNotify.push(node);
				return;
			}
			var oldVal = graph.node(node).get("cachedValue");
			graph.node(node).get("recompute")();
			var newVal = graph.node(node).get("cachedValue");
			return oldVal !== newVal;
		}

		var changedNodes = new Set(this.changed.filter(function(node) {
			var change = this.changes[node];
			return change.oldVal !== change.newVal;
		}, this));
		var hasChanged = changedNodes.has.bind(changedNodes);
		graph.dependencyOrder(this.changed).filter(function(node) {
			return !hasChanged(node);
		}).forEach(function(node) {
			var n = graph.node(node);
			
			if (n.dependencies().some(hasChanged)) {
				var changed = recompute(node);
				if (changed) {
					changedNodes.add(node);
				}
			}
		}, this);
		this.toNotify = toNotify;
	};
	Batch.prototype.send = function() {
		_.uniq(this.toNotify).forEach(function(listener) {
			var cb = this.graph.node(listener).get("listener");
			// XXX the listener may have been removed during the recompute
			// process, so we can ignore it (as long as there is not a bug
			// somewhere else.)
			if (cb) {
				cb();
			}
		}, this);
	};

	function Computes() {
		var accessed = false;
		var graph = new Graph();

		var idOf = (function() {
			// XXX add a non-enumerable, random key to the object so we can 
			// identify it again efficiently.
			var oid = 1;
			var EXPANDO = "compute-js-" + Math.random().toString(36).slice(2);

			return function(thing) {
				if (!thing[EXPANDO]) {
					Object.defineProperty(thing, EXPANDO, {
						configurable: false,
						enumerable: false,
						value: "L" + (++oid) + "_" + thing.name,
					});
				}
				return thing[EXPANDO];
			};
		})();

		var batch;
		var batchDepth = 0;
		var nsId = 0;
		function afterBatch(id, oldVal, newVal) {
			if (batch) {
				batch.addChange(id, oldVal, newVal);
			} else {
				var b = new Batch(graph);
				b.addChange(id, oldVal, newVal);
				b.send();
			}
		}
		function listenerKey(fn, id) {
			return idOf(fn) + "_on_" + id;
		}
		// Simple observable wrapper around a value.
		function valueCompute(opts) {
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
				if (accessed) {
					accessed(id);
					// TODO if dev
					graph.node(id).set("name", holder.computeName);
				}
				return value;
			};
			holder.set = function(newVal) {
				var oldVal = value;
				value = newVal;
				afterBatch(id, oldVal, newVal);
			};
			holder.onChange = function(listener) {
				graph.node(listenerKey(listener, id)).dependsOn(id).
					set("listener", listener);
			};
			holder.offChange = function(listener) {
				graph.node(listenerKey(listener, id)).noLongerDependsOn(id);				
			};

			holder.computeName = "" + (opts.name || value || id);

			return holder;
		}
		// Wraps a computation of value computes.
		function compute(opts) {			
			var id = "C" + (++nsId);
			function wrapper(newVal) {
				if (arguments.length) {
					return wrapper.set(newVal);
				}
				return wrapper.get();
			}
			function ensureActive() {
				if (!graph.node(id).hasDependents()) {
					// nothing was observing before, so create our node in the graph
					recompute();
				}
			}

			var getter = function() {
				return opts.get.call(opts.ctx);
			};
			wrapper.get = function() {
				if (accessed) {
					ensureActive();
					accessed(id);
				}
				var n = graph.node(id);
				return n.has("cachedValue") ? n.get("cachedValue") : getter();
			};

			var setter = opts.set;
			wrapper.set = setter && function(newValue) {
				return setter.call(opts.ctx, newValue);
			};

			// recompute ensures that the graph is updated with our most 
			// current value and dependencies
			function recompute() {
				var n = graph.node(id);
				var oldDeps = n.dependencies();
				var newDeps = [];
				var lastAccess = accessed;
				accessed = function(id) {
					newDeps.push(id);
				};
				n.set("isCompute", true);
				n.set("recompute", recompute);
				n.set("cachedValue", record(getter));
				n.set("name", wrapper.computeName);

				_.difference(oldDeps, newDeps).forEach(function(id) {
					n.noLongerDependsOn(id);
				});
				newDeps.forEach(function(id) {
					n.dependsOn(id);
				});
				accessed = lastAccess;
			}

			wrapper.onChange = function(listener) {
				ensureActive();
				graph.node(listenerKey(listener, id)).dependsOn(id).
					set("listener", listener);
			};
			wrapper.offChange = function(listener) {
				graph.node(listenerKey(listener, id)).noLongerDependsOn(id);
			};

			wrapper.cid = id;

			wrapper.computeName = opts.name || opts.get.name || id;

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
			if (c && typeof c.get === "function" && c.get.length === 0) {
				return compute(c);
			}
			ctx = typeof ctx === "string" ? { name: ctx } : ctx;
			return valueCompute(_.extend({}, ctx || {}, {
				value: c
			}));
		}
		make.startBatch = function() {
			if (!batchDepth) {
				batch = new Batch(graph);
			}
			batchDepth++;
		};
		make.endBatch = function() {
			if (batchDepth <= 0) {
				throw new Error("Not in batch!");
			}

			batchDepth--;

			if (!batchDepth) {
				var b = batch;
				batch = null;
				b.send();
			}
		};
		make.value = function(opts) {
			opts = opts && opts.hasOwnProperty("value") ? opts : {
				value: opts,
			};
			return valueCompute(opts);
		};

		var connected = [];
		function record(fn) {
			var result;
			// Provide each connected compute with an access function that 
			// creates a node in the graph that behaves like a value compute.
			connected.reduce(function(fn, connected) {
				return function() {
					connected.record(fn, function(api, id) {
						var name = "connected:" + connected.name + ":" + (api.computeName || id);
						var cid = "connected_" + connected.name + "_" + id;

						function update() {
							afterBatch(cid, true, false);
						}

						var n = graph.node(cid);
						n.set("name", name);
						n.set("onRemove", function() {
							api.offChange(update);
						});
						api.onChange(update);

						accessed(cid);
					});
				};
			}, function() { result = fn(); })();
			return result;
		}
		make.connect = function(c) {
			connected.push(c);
		};

		make.graph = function() {
			return graph.toJSON();
		};

		make.vizualize = function(g) {
			g = g || make.graph();
			var lines = [];
			_.each(g, function(node, id) {
				lines.push(id + '[label="' + (node.name || id) + '\\n(' + id + ')"];');

				_.each(node.dependencies || [], function(t, depId) {
					lines.push(id + " -> " + depId);
				});
			});
			lines.sort();
			return "strict digraph dependencies {\n\t" +
				lines.join("\n\t") + "\n}";
		};

		return make;
	}

	var defaultSpace = new Computes();
	// Can't think of why you would want a separate compute space, but
	// knock yourself out creating them if you like.
	defaultSpace.constructor = Computes;
	module.exports = defaultSpace;
})(this);

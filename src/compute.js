(function() {
	"use strict";

	var _ = require("./_");
	var Graph = require("./graph");
	var Set = require("./string-collections").Set;

	// batch of compute updates
	function Batch(graph) {
		this.graph = graph;
		this.changes = {};
	}
	Batch.prototype.addChange = function(id, oldVal, newVal) {
		var change = this.changes[id] = this.changes[id] || {
			oldVal: oldVal,
			toNotify: [],
		};
		change.newVal = newVal;
		// PERF can we lazy recompute somehow if in a batch?
		
		// if the current value is a change, recompute
		if (oldVal !== newVal) {
			change.toNotify = change.toNotify.
				concat(recomputeChanged(this.graph, id));
		}
	};

	function recomputeChanged(graph, changedNode) {
		var toNotify = [];
		// To recompute, we start with the value nodes that changed (this.changes)
		// We then have to find all the nodes that are somehow dependent on them.
		// We then get an ordering of all the nodes such that dependencies are
		// recomputed before dependents.
		// At that point, all we have to do is recompute them in order. If we 
		// get to a node that has no dependencies that have changed value, we
		// skip it.
		function recompute(node) {
			var data = graph.nodeData(node);
			if (!data.get("isCompute")) {
				// assuming that any node that is not a compute is a listener
				toNotify.push(node);
				return;
			}
			var oldVal = data.get("cachedValue");
			data.get("recompute")();
			var newVal = data.get("cachedValue");
			var equal = data.get("isEqual") || function(oldVal, newVal) {
				return oldVal === newVal;
			};
			return !equal(oldVal, newVal);
		}

		var changedNodes = new Set([changedNode]);
		var hasChanged = changedNodes.has.bind(changedNodes);
		graph.dependencyOrder([changedNode]).filter(function(node) {
			return !hasChanged(node);
		}).forEach(function(node) {
			if (graph.dependencies(node).some(hasChanged)) {
				var changed = recompute(node);
				if (changed) {
					changedNodes.add(node);
				}
			}
		});
		return toNotify;
	}

	Batch.prototype.send = function() {
		_.each(this.changes, function(change) {
			if (change.oldVal === change.newVal) {
				return;
			}
			_.uniq(change.toNotify || []).forEach(function(listener) {
				var cb = this.graph.nodeData(listener).get("listener");
				// XXX the listener may have been removed during the recompute
				// process, so we can ignore it (as long as there is not a bug
				// somewhere else.)
				if (cb) {
					cb();
				}
			}, this);
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
					graph.nodeData(id).set("name", holder.computeName);
				}
				return value;
			};
			holder.set = function(newVal) {
				var oldVal = value;
				value = newVal;
				afterBatch(id, oldVal, newVal);
			};
			holder.onChange = function(listener) {
				var key = listenerKey(listener, id);
				graph.dependsOn(key, id);
				graph.nodeData(key).set("listener", listener);
			};
			holder.offChange = function(listener) {
				graph.noLongerDependsOn(listenerKey(listener, id), id);				
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
				if (!graph.hasDependents(id)) {
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
				var n = graph.nodeData(id);
				return n.has("cachedValue") ? n.get("cachedValue") : getter();
			};

			var setter = opts.set;
			wrapper.set = setter && function(newValue) {
				return setter.call(opts.ctx, newValue);
			};

			// recompute ensures that the graph is updated with our most 
			// current value and dependencies
			function recompute() {
				var n = graph.nodeData(id);
				var oldDeps = graph.dependencies(id);
				var newDeps = [];
				var lastAccess = accessed;
				accessed = function(id) {
					newDeps.push(id);
				};
				n.set("isCompute", true);
				n.set("isEqual", opts.isEqual);
				n.set("recompute", recompute);
				n.set("cachedValue", record(getter));
				n.set("name", wrapper.computeName);

				_.difference(oldDeps, newDeps).forEach(function(dep) {
					graph.noLongerDependsOn(id, dep);
				});
				newDeps.forEach(function(dep) {
					graph.dependsOn(id, dep);
				});
				accessed = lastAccess;
			}

			wrapper.onChange = function(listener) {
				ensureActive();
				var key = listenerKey(listener, id);
				graph.dependsOn(key, id);
				graph.nodeData(key).set("listener", listener);
			};
			wrapper.offChange = function(listener) {
				graph.noLongerDependsOn(listenerKey(listener, id), id);
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

						var n = graph.nodeData(cid);
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
					lines.push(id + " -> " + depId + ";");
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

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.computejs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
(function() {
	"use strict";

	var slice = [].slice;

	exports.difference = function(array, toRemove) {
		return array.filter(function(value) {
			return !~toRemove.indexOf(value);
		});
	};
	exports.each = function(obj, iterator, ctx) {
		if (!obj) {
			return;
		}
		if (obj.forEach) {
			return obj.forEach(iterator, ctx);
		} else {
			Object.keys(obj || {}).forEach(function(key) {
				iterator.call(this, obj[key], key);
			}, ctx);
		}
	};
	exports.extend = function() {
		var objs = exports.toArray(arguments);
		var target = objs.shift();
		objs.forEach(function(obj) {
			exports.each(obj, function(value, key) {
				target[key] = value;
			});
		});
		return target;
	};
	exports.flatten = function(array) {
		if (!Array.isArray(array)) {
			return [array];
		}
		var result = [];
		array.forEach(function(item) {
			result.push.apply(result, exports.flatten(item));
		});
		return result;
	};
	exports.toArray = function(arg) {
		return slice.call(arg || []);
	};
	exports.uniq = function(array) {
		return exports.toArray(array).filter(function(value, i) {
			return !~array.slice(0, i).indexOf(value);
		});
	};

})();
},{}],2:[function(_dereq_,module,exports){
(function() {
	"use strict";

	var _ = _dereq_("./_");
	var Graph = _dereq_("./graph");
	var Set = _dereq_("./string-collections").Set;

	// batch of compute updates
	function Batch(graph) {
		this.graph = graph;
		this.changes = {};
	}
	Batch.prototype.tx = function() {
		this._tx = true;
		return this;
	};
	Batch.prototype.addChange = function(id, oldVal, newVal) {
		var change = this.changes[id] = this.changes[id] || {
			id: id,
			oldVal: oldVal,
			toNotify: [],
		};
		change.newVal = newVal;
		if (this._tx) {
			return;
		}
		
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
			var recomp = data.get("recompute");
			if (!recomp) {
				// assuming that any node that is not a compute is a listener
				toNotify.push(node);
				return;
			}
			return recomp();
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

	Batch.prototype.commit = function() {
		_.each(this.changes, function(change, id) {
			change.toNotify = recomputeChanged(this.graph, id);
		}, this);
		this.send();
	};

	Batch.prototype.rollback = function() {
		_.each(this.changes, function(change, id) {
			this.graph.nodeData(id).get("setValue")(change.oldVal);
		}, this);
	};

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
					// TODO only set name if dev
					graph.nodeData(id).set("name", holder.computeName);
					graph.nodeData(id).set("setValue", holder.set);
				}
				return value;
			};
			holder.peek = function() {
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
				return wrapper.peek();
			};

			wrapper.peek = function() {
				var n = graph.nodeData(id);
				return n.has("cachedValue") ? n.get("cachedValue") : getter();
			};

			var setter = opts.set;
			wrapper.set = setter && function(newValue) {
				return setter.call(opts.ctx, newValue);
			};

			var isEqual = opts.isEqual || function(oldVal, newVal) {
				return oldVal === newVal;
			};

			function rmDep(dep) {
				graph.noLongerDependsOn(id, dep);
			}

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
				var oldVal = n.get("cachedValue");
				var newVal = record(getter);
				n.set("recompute", recompute);
				n.set("cachedValue", newVal);
				n.set("onNoDependents", function() {
					graph.dependencies(id).forEach(rmDep);
				});
				n.set("name", wrapper.computeName);

				_.difference(oldDeps, newDeps).forEach(rmDep);
				newDeps.forEach(function(dep) {
					graph.dependsOn(id, dep);
				});
				accessed = lastAccess;

				return !isEqual(oldVal, newVal);
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
		make.rollback = function() {
			if (!batch) {
				throw new Error("No batch to roll back!");
			}
			batch.rollback();
			batch = null;
			batchDepth = 0;
		};
		make.createTransaction = function() {
			var txBatch = new Batch(graph).tx();
			var oldBatch = batch;
			batch = txBatch;
			return {
				commit: function() {
					batch = oldBatch;
					txBatch.commit();
				},
				rollback: function() {
					batch = oldBatch;
					txBatch.rollback();
				},
			};
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
						// if we already have a node for the connected compute,
						// there is no need to observe it a second time
						if (!n.has("onRemove")) {						
							n.set("name", name);
							n.set("onRemove", function() {
								api.offChange(update);
							});
							api.onChange(update);
						}

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
			function quote(s) { return '"' + s.replace(/"/g, '&quot;') + '"'; }
			_.each(g, function(node, id) {
				if (node.name) {
					var label = node.name + "\\n(" + id + ")";
					lines.push(quote(id) + '[label=' + quote(label) + '];');
				}

				_.each(node.dependencies || [], function(t, depId) {
					lines.push(quote(id) + " -> " + quote(depId) + ";");
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

},{"./_":1,"./graph":3,"./string-collections":4}],3:[function(_dereq_,module,exports){
(function() {
	"use strict";

	var _ = _dereq_("./_");
	var asArray = _dereq_("./string-collections").asArray;
	var asObject = _dereq_("./string-collections").asObject;
	var Map = _dereq_("./string-collections").Map;
	var Set = _dereq_("./string-collections").Set;
	var MapWrapper = _dereq_("./string-collections").MapWrapper;

	function defaultMap(makeDefault) {
		function DefaultMap(iterable) {
			MapWrapper.call(this, new Map(iterable));
		}

		DefaultMap.prototype = new MapWrapper();
		DefaultMap.constructor = DefaultMap;

		DefaultMap.prototype.get = function(key) {
			if (!this.has(key)) {
				this.set(key, makeDefault.call(this, key));
			}
			return this.map.get(key);
		};
		return DefaultMap;
	}

	var SetMap = defaultMap(function() {
		return new Set();
	});

	var MapMap = defaultMap(function() {
		return new Map();
	});

	// strict digraph, no edge weights. O(1) non-traversal operations
	// data added to nodes will be removed when the node is no longer 
	// connected to the graph
	function Graph() {
		this._dependsOn = new SetMap();
		this._dependedOnBy = new SetMap();
		this._nodeData = new MapMap();
	}

	function dfs(graph, node, visited, visitor) {
		visited = visited || new Set();
		visited.add(node);
		graph.get(node).forEach(function(next) {
			if (!visited.has(next)) {
				dfs(graph, next, visited, visitor);
			}
		});
		visitor(node);
		return visited;
	}

	function clean(graph, name) {
		var tearDown = graph._nodeData.get(name).get("onRemove");
		if (tearDown) {
			tearDown();
		}
		graph._dependsOn.delete(name);
		graph._dependedOnBy.delete(name);
		graph._nodeData.delete(name);
	}

	// an anonymous node is one that doesn't have any incoming edges
	// (no other node knows about/depends on it)
	function cleanAnonymous(graph, name) {
		var tearDown = graph._nodeData.get(name).get("onNoDependents");
		if (tearDown) {
			tearDown();
		}
	}

	_.extend(Graph.prototype, {
		// TODO check for cycles in dev mode
		dependencyOrder: function(nodes) {
			// first we need to find all the nodes that depend on the given nodes
			var dependents = nodes.reduce(function(visited, node) {
				return dfs(this._dependedOnBy, node, visited, function() {});
			}.bind(this), new Set());

			// then run the topological sort algorithm to get a dependency ordering
			// (which guarantees that all a node's dependencies come before it)
			var visited = new Set();
			var finished = [];
			dependents.forEach(function(node) {
				if (!visited.has(node)) {
					dfs(this._dependsOn, node, visited, function(doneNode) {
						finished.push(doneNode);
					});
				}
			}, this);

			return finished;
		},
		nodeData: function(name) {
			return this._nodeData.get(name);
		},
		noLongerDependsOn: function(name, dependency) {
			var dependsOn = this._dependsOn.get(name);
			var dependendOnBy = this._dependedOnBy;
			dependsOn.delete(dependency);
			var incoming = dependendOnBy.get(dependency);
			incoming.delete(name);
			
			// cleanup node data
			if (!dependsOn.size && !dependendOnBy.get(name).size) {
				clean(this, name);
			} 
			if (!incoming.size) {
				cleanAnonymous(this, dependency);
				if (!this._dependsOn.get(dependency).size) {
					clean(this, dependency);
				}
			}
		},
		hasDependents: function(name) {
			var dependendOnBy = this._dependedOnBy;
			var dependents = dependendOnBy.get(name);
			return dependents.size > 0;
		},
		dependsOn: function(name, dependency) {
			var dependsOn = this._dependsOn.get(name);
			var dependendOnBy = this._dependedOnBy;
			dependsOn.add(dependency);
			dependendOnBy.get(dependency).add(name);
			return this;
		},
		dependencies: function(name) {
			var dependsOn = this._dependsOn.get(name);
			return asArray(dependsOn);
		},
		dependents: function(name) {
			var dependendOnBy = this._dependedOnBy;
			var dependents = dependendOnBy.get(name);
			return asArray(dependents);
		},
		toJSON: function() {
			var result = {};
			var data = function(node) {
				return asObject(this._nodeData.get(node) || {});
			}.bind(this);
			this._dependsOn.forEach(function(deps, node) {
				result[node] = _.extend(data(node), {
					dependencies: asArray(deps).reduce(function(deps, dep) {
						result[dep] = result[dep] || data(dep);
						deps[dep] = true;
						return deps;
					}, {}),
				});
			}, this);
			return result;
		},
	});

	module.exports = Graph;
})();
},{"./_":1,"./string-collections":4}],4:[function(_dereq_,module,exports){
(function() {
	"use strict";

	function assertString(value, name) {
		if (typeof value !== "string") {
			throw new TypeError(name + " is not a string! : " + value);
		}
	}

	function asArray(iterable) {
		var result = [];
		(iterable || []).forEach(function(value) {
			result.push(value);
		});
		return result;
	}

	function asObject(iterable) {
		var result = {};
		(iterable || []).forEach(function(value, key) {
			result[key] = value;
		});
		return result;
	}

	// define shims for Map and Sets. Our versions only support string
	// keys in Map and string values in sets.
	var global = (function() {
		/*jshint evil:true */
		return new Function("return this;");
	})()();


	// Chrome's Set and Map do not create entries from the argument
	function shimMap(Map) {
		var map = new Map([
			["uses", "array"],
			["to", "constructor"],
		]);

		if (map.get("uses") !== "array") {
			return function(iterable) {
				var m = new Map();
				asArray(iterable).forEach(function(pair) {
					m.set(pair[0], pair[1]);
				});
				return m;
			};
		}

		return Map;
	}

	function shimSet(Set) {
		var set = new Set("uses", "array", "to", "constructor");

		if (set.size !== 4 || !set.has("to")) {
			return function(iterable) {
				var s = new Set();
				asArray(iterable).forEach(function(value) {
					s.add(value);
				});
				return s;
			};
		}

		return Set;
	}

	var Map = (function() {
		// XXX the Chrome 36 implementation of Sets somehow is inserting 
		// undefineds (despite never calling add() with undefined)
		// May be a bug in the Map
		// if (global.Map) {
		// 	return shimMap(global.Map);
		// }

		function Map(iterable) {
			Object.defineProperty(this, "__store", {
				configurable: false,
				enumerable: false,
				value: asArray(iterable).reduce(function(store, pair) {
					store[pair[0]] = store[pair[1]];
					return store;
				}, {}),
				writeable: true,
			});
			this.size = Object.keys(this.__store).length;
		}

		Map.prototype.get = function(key) {
			assertString(key, "Map.get(key)");
			return this.__store[key];
		};
		Map.prototype.set = function(key, value) {
			assertString(key, "Map.set(key)");
			if (!this.has(key)) {
				this.size++;
			}
			this.__store[key] = value;
		};
		Map.prototype.has = function(key) {
			assertString(key, "Map.has(key)");
			return key in this.__store;
		};
		Map.prototype.delete = function(key) {
			assertString(key, "Map.delete(key)");
			if (this.has(key)) {
				this.size--;
			}
			delete this.__store[key];
		};
		Map.prototype.clear = function() {
			this.size = 0;
			this.__store = {};
		};

		Map.prototype.forEach = function(iterator, context) {
			return Object.keys(this.__store).forEach(function(key) {
				iterator.call(context, this.get(key), key, this);
			}, this);
		};

		return Map;
	})();

	var Set = (function() {
		// XXX the Chrome 36 implementation of Sets somehow is inserting 
		// undefineds (despite never calling add() with undefined)
		// may be a bug in the Map
		// if (global.Set) {
		// 	return shimSet(global.Set);
		// }

		function Set(iterable) {
			Object.defineProperty(this, "__store", {
				configurable: false,
				enumerable: false,
				value: new Map(asArray(iterable).map(function(key) {
					return [key, true];
				})),
				writeable: true,
			});		
		}

		Set.prototype.add = function(key) {
			assertString(key, "Set.add(key)");
			this.__store.set(key, true);
			return this;
		};
		Set.prototype.clear = function() {
			this.__store = new Map();
		};
		Set.prototype.delete = function(key) {
			assertString(key, "Set.delete(key)");
			this.__store.delete(key);
		};
		Set.prototype.has = function(key) {
			assertString(key, "Set.has(key)");
			return this.__store.has(key);
		};

		Set.prototype.forEach = function(iterator, context) {
			this.__store.forEach(function(on, key) {
				iterator.call(context, key, key, this);
			}, this);
		};

		Object.defineProperties(Set.prototype, {
			size: {
				get: function() {
					return this.__store.size;
				},
			},
		});

		return Set;
	})();

	var wrapMethods = [
		"get",
		"set",
		"has",
		"delete",
		"clear",
		"forEach",
	];
	var wrapProps = ["size"];
	function MapWrapper(map) {
		this.map = map || new Map();
	}
	wrapMethods.forEach(function(method) {
		this[method] = function() {
			return this.map[method].apply(this.map, arguments);
		};
	}, MapWrapper.prototype);
	wrapProps.forEach(function(prop) {
		Object.defineProperty(this, prop, {
			get: function() {
				return this.map[prop];
			},
		});
	}, MapWrapper.prototype);

	module.exports = {
		asArray: asArray,
		asObject: asObject,
		Map: Map,
		Set: Set,
		MapWrapper: MapWrapper,
	};
})();

},{}]},{},[2])
(2)
});
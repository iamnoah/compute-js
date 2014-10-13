(function() {
	"use strict";

	var _ = require("./_");
	var asArray = require("./string-collections").asArray;
	var asObject = require("./string-collections").asObject;
	var Map = require("./string-collections").Map;
	var Set = require("./string-collections").Set;
	var MapWrapper = require("./string-collections").MapWrapper;

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
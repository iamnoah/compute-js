(function() {
	"use strict";

	var _ = require("./_");
	var asArray = require("./string-collections").asArray;
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
		graph._dependsOn.delete(name);
		graph._dependedOnBy.delete(name);
		graph._nodeData.delete(name);
	}

	_.extend(Graph.prototype, {
		activeNodes: function() {
			var keys = new Set();
			function addKey(value, key) {
				keys.add(key);
			}
			this._dependsOn.forEach(addKey);
			this._dependedOnBy.forEach(addKey);
			return asArray(keys);
		},
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
		node: function(name) { 	
			var graph = this;
			var dependsOn = this._dependsOn.get(name);
			var dependendOnBy = this._dependedOnBy;
			var dependents = dependendOnBy.get(name);
			var data = this._nodeData.get(name);
			return {
				get: data.get.bind(data),
				has: data.has.bind(data),
				set: data.set.bind(data),
				noLongerDependsOn: function(dependency) {
					dependsOn.delete(dependency);
					var incoming = dependendOnBy.get(dependency);
					incoming.delete(name);
					
					// cleanup node data
					if (!dependsOn.size && !dependendOnBy.get(name).size) {
						clean(graph, name);
					} 
					if (!incoming.size && !graph._dependsOn.get(dependency).size) {
						clean(graph, dependency);
					}
					return this;
				},
				hasDependents: function() {
					return dependents.size > 0;
				},
				dependsOn: function(dependency) {
					dependsOn.add(dependency);
					dependendOnBy.get(dependency).add(name);
					return this;
				},
				dependencies: function() {
					return asArray(dependsOn);
				},
				dependents: function() {
					return asArray(dependents);
				},
			};
		},
		viz: function() {
			var edges = [];
			this._dependsOn.forEach(function(deps, node) {
				deps.forEach(function(dep) {
					edges.push(node + " -> " + dep + ";");
				});
			});
			return "strict digraph {\n\t" + edges.join("\n\t") + "\n}";
		},
	});

	module.exports = Graph;
})();
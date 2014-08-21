/*global describe, it*/
"use strict";
var Graph = require("../src/graph");
/*jshint expr:true */ // ignore misisng assignment warnings since should makes a lot of them
var should = require("should");

function contains(a, b) {
	b.forEach(function(value) {
		a.should.containEql(value);
	});
}

describe("graph", function() {
	it("should express dependencies", function() {
		var graph = new Graph();

		graph.dependsOn("2", "1");
		graph.dependsOn("4", "2");
		graph.dependsOn("true", "2");
		graph.dependsOn("1", "false");
		graph.dependsOn("abc", "def");

		graph.toJSON().should.containDeep({
			abc: {
				dependencies: {
					def: true,
				},
			},
			def: {},
			1: {
				dependencies: {
					false: true,
				},
			},
			2: {
				dependencies: {
					1: true,
				},
			},
			4: {
				dependencies: {
					2: true,
				},
			},
			false: {},
			true: {
				dependencies: {
					2: true,
				},
			},
		});

		graph.noLongerDependsOn("abc", "def");

		graph.toJSON().should.containDeep({
			1: {
				dependencies: {
					false: true,
				},
			},
			2: {
				dependencies: {
					1: true,
				},
			},
			4: {
				dependencies: {
					2: true,
				},
			},
			false: {},
			true: {
				dependencies: {
					2: true,
				},
			},
		});
		
	});
	it("should support traversal of dependents", function() {
		var graph = new Graph();

		graph.dependsOn("2", "1");
		graph.dependsOn("4", "2");
		graph.dependsOn("true", "2");
		graph.dependsOn("1", "false");

		contains(graph.dependents("false"), ["1"]);
		contains(graph.dependents("2"), ["true", "4"]);
	});

	it("should clean data", function() {
		var graph = new Graph();
		graph.dependsOn("a", "b");
		graph.nodeData("a").set("mark", true);
		graph.nodeData("b").set("mark", true);

		// the only thing keeping both nodes in the graph is their dependency
		graph.noLongerDependsOn("a", "b");
		should(graph.nodeData("a").get("mark")).not.eql.true;
		should(graph.nodeData("b").get("mark")).not.eql.true;
	});

	it("should call onRemove when a node is removed", function() {
		var graph = new Graph();
		var removed = {};
		function rm(name) {
			removed[name] = true;
		}
		graph.dependsOn("a", "b");
		graph.nodeData("a").set("onRemove", rm.bind(null, "a"));
		graph.nodeData("b").set("onRemove", rm.bind(null, "b"));
		
		removed.should.eql({});
		graph.noLongerDependsOn("a", "b");
		removed.should.eql({a: true, b: true});
	});


	describe("dependencyOrder(node)", function() {
		it("should return a correct topological sort", function() {
			var graph = new Graph();
			graph.dependsOn("A", "B");			
			graph.dependsOn("B", "C");
			graph.dependsOn("D", "B");
			graph.dependsOn("D", "C");
			graph.dependsOn("F", "R");
			graph.dependsOn("C", "R");

			// could be any of these variations
			[
				["R", "F", "C", "B", "A", "D"],
				["R", "F", "C", "B", "D", "A"],
				["R", "C", "B", "D", "F", "A"],
				["R", "C", "B", "F", "A", "D"],
			].should.containEql(graph.dependencyOrder(["R"]));
		});
	});
});

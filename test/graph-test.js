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

		graph.node("2").dependsOn("1");
		graph.node("4").dependsOn("2");
		graph.node("true").dependsOn("2");
		graph.node("1").dependsOn("false");
		graph.node("abc").dependsOn("def");

		graph.toJSON().should.eql({
			abc: {
				dependencies: {
					def: true,
				},
			},
			def: {
				dependencies: {},				
			},
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
			false: {
				dependencies: {},
			},
			true: {
				dependencies: {
					2: true,
				},
			},
		});

		graph.node("abc").noLongerDependsOn("def");

		graph.toJSON().should.eql({
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
			false: {
				dependencies: {},
			},
			true: {
				dependencies: {
					2: true,
				},
			},
		});
		
	});
	it("should support traversal of dependents", function() {
		var graph = new Graph();

		graph.node("2").dependsOn("1");
		graph.node("4").dependsOn("2");
		graph.node("true").dependsOn("2");
		graph.node("1").dependsOn("false");

		contains(graph.node("false").dependents(), ["1"]);
		contains(graph.node("2").dependents(), ["true", "4"]);
	});

	it("should clean data", function() {
		var graph = new Graph();
		graph.node("a").dependsOn("b");
		graph.node("a").set("mark", true);
		graph.node("b").set("mark", true);

		// the only thing keeping both nodes in the graph is their dependency
		graph.node("a").noLongerDependsOn("b");
		should(graph.node("a").get("mark")).not.eql.true;
		should(graph.node("b").get("mark")).not.eql.true;
	});

	it("should call onRemove when a node is removed", function() {
		var graph = new Graph();
		var removed = {};
		function rm(name) {
			removed[name] = true;
		}
		graph.node("a").dependsOn("b");
		graph.node("a").set("onRemove", rm.bind(null, "a"));
		graph.node("b").set("onRemove", rm.bind(null, "b"));
		
		removed.should.eql({});
		graph.node("a").noLongerDependsOn("b");
		removed.should.eql({a: true, b: true});
	});


	describe("dependencyOrder(node)", function() {
		it("should return a correct topological sort", function() {
			var graph = new Graph();
			graph.node("A").dependsOn("B");			
			graph.node("B").dependsOn("C");
			graph.node("D").dependsOn("B");
			graph.node("D").dependsOn("C");
			graph.node("F").dependsOn("R");
			graph.node("C").dependsOn("R");

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

/*global describe, it*/
"use strict";
var compute = require("../src/compute");
var _ = require("../src/_");
require("should");

describe("compute", function() {
	var c = compute(123);
	describe("as a value holder", function() {
		it("should handle null", function() {
			var n = compute.value(null);
			(n() === null).should.be.true;
			n = compute(null);
			(n() === null).should.be.true;
		});
		it("should return the computed value", function() {
			c().should.eql(123);
		});
		it("should take updates", function() {
			c.set(456);
			c.get().should.eql(456);
		});
		it("should notify listeners when the value changes", function() {
			var changes = 0;
			function countChange() {
				changes++;
			}
			c.onChange(countChange);
			c.set("hi");
			c.get().should.eql("hi");
			c.set("whoa");
			c.set("whoa");
			changes.should.eql(2);
			c.offChange(countChange);
		});
	});

	describe("as compute based on other values", function() {
		var a = compute(4);
		var b = compute(2);

		var ab = compute(function() {
			return a() * (b() % 3);
		});

		it("should reflect the latest values", function() {
			ab().should.eql(8);
			a.set(1);
			ab().should.eql(2);
		});
		it("should notify on changes", function() {
			var changes = 0;
			function countChange() {
				changes++;
			}
			a.set(3);
			ab.onChange(countChange);
			ab.get().should.eql(6);
			a.set(4);
			ab.get().should.eql(8);
			changes.should.eql(1);
			ab.offChange(countChange);
		});

		it("should not bind to peeked computed", function() {
			var c = compute(6);
			var buh = compute(function() {
				a.peek().should.eql(4);
				b.peek().should.eql(2);
				return c.get();
			});

			var changes = 0;
			function count() {
				changes++;
			}
			buh.onChange(count);
			c.get().should.eql(6);
			a.set(10);
			changes.should.eql(0);
			a.set(4);
		});

		it("should take context as the 2nd parameter", function() {
			var foo = compute(function() {
				return this.bar(a(), b());
			}, {
				bar: function(a, b) {
					return a + b;
				},
			});

			foo().should.eql(6);

			var changes = 0;
			function countChange() {
				changes++;
			}
			foo.onChange(countChange);
			a(10);		
			foo().should.eql(12);
			changes.should.eql(1);
			foo.offChange(countChange);
		});

		it("should notify with nested computes", function() {
			var nested = compute(function() {
				return ab() / b();
			});
			a.set(4);
			var changes = 0;
			function countChange() {
				changes++;
			}
			nested.onChange(countChange);
			a.set(5);
			nested.get().should.eql(5);
			changes.should.eql(1);

			// changing b wont change the result
			b.set(1);
			nested.get().should.eql(5);
			changes.should.eql(1);

			nested.offChange(countChange);
		});

		it("should stop notifications", function() {
			var changes = 0;
			function countChange() {
				changes++;
			}
			ab.onChange(countChange);
			a.set(3);
			ab.offChange(countChange);
			a.set(4);
			changes.should.eql(1);
		});
		it("should rebind on change", function() {
			var rebind = compute(function() {
				return b() > 5 ? ab() : a();
			});
			var changes = 0;
			function countChange() {
				changes++;
			}
			rebind.onChange(countChange);
			a.set(10);
			changes.should.eql(1);
			rebind().should.eql(a());

			b.set(6);
			changes.should.eql(2);
			rebind().should.eql(ab());
			rebind.offChange(countChange);
		});

		it("should notify the same listener for different values and allow listeners to be removed", function() {
			var root = compute.value({
				a: 1,
				b: 2,
			});

			var a = compute(function() {
				return root().a;
			});


			var b = compute(function() {
				return root().a;
			});

			var changes = 0;
			function first() {
				changes++;
				// second is queued to be notified at this point, but if we 
				// don't need it anymore, that's cool
				a.offChange(second);
			}

			function second() {
				"second should never be called".should.be.false;
			}

			a.onChange(first);
			b.onChange(first);
			a.onChange(second);

			root.set({
				a: 2, b: 3,
			});

			changes.should.eql(2);
		});

		it("should cache intermediate values and coalesce changes", function() {
			var root = compute.value({
				a: 1,
				b: 2,
			});

			var a = compute(function() {
				return root().a;
			});
			var b = compute(function() {
				return root().b;
			});

			var c = compute(function() {
				return a() + b();
			});

			function shouldNotChange() {
				false.should.be.true;
			}
			c.onChange(shouldNotChange);

			root({
				a: 1,
				b: 2,
				c: 3,
			});
			c().should.eql(3);

			c.offChange(shouldNotChange);

			var change = 0;
			function shouldCoalesce() {
				c().should.eql(5);
				change++;
			}
			c.onChange(shouldCoalesce);

			root({
				a: 2,
				b: 3,
				c: 3,
			});

			// if there was more than 1 change, then there was a change event 
			// publishing an inconsistent value
			change.should.eql(1);

			c.offChange(shouldCoalesce);
		});

		it("should always notify on changes", function() {
			var root = compute.value({
				a: false,
				b: 2,
			});

			// Because a short circuits initially, it will be bound to root
			// before b, and therefore will always recompute first.
			// This test was added because when a accessed the value of b while
			// recomputing, a's dirty flag was cleared without a's listeners 
			// being notified.
			var a = compute(function() {
				return root().a && b();
			});
			var b = compute(function() {
				return root().b;
			});

			b.get().should.eql(2);
			function ignore() {
			}
			function count() {
				changes++;
			}
			var changes = 0;
			a.onChange(ignore);
			b.onChange(count);


			root.set({
				a: true,
				b: 2,
			});
			changes.should.eql(0);
			b.get().should.eql(2);

			root.set({
				a: true,
				b: 3,
			});
			b.get().should.eql(3);
			// b should have changed
			changes.should.eql(1);

			a.offChange(ignore);
			b.offChange(count);
		});

		it("should support custom equality", function() {
			var root = compute.value({
				things: [{
					id: 1,
				},{
					id: 2,
				},{
					id: 3,
				},]
			});

			var thingIds = compute({
				get: function() {
					return root().things.map(function(thing) {
						return thing.id;
					});
				},
				isEqual: function(a, b) {
					a = a || [];
					b = b || [];
					return !_.difference(a, b).length &&
						!_.difference(b, a).length;
				},
			});

			var changes = 0;
			function count() {
				changes++;
			}
			thingIds.onChange(count);

			root.set({
				things: [{
					id: 2,
				},{
					id: 3,
				},{
					id: 1,
				},]
			});
			changes.should.eql(0);

			root.set({
				things: [{
					id: 3,
				},{
					id: 1,
				},]
			});
			changes.should.eql(1);

			thingIds.offChange(count);
		});

		it("should minimize recomputes", function() {
			// a -> b -> c -> d -> z;
			// a -> z;
			// each node should only recompute once
			var counts = {};
			var z = compute(1);
			function count(name) {
				counts[name] = (counts[name] || 0) + 1;
			}

			var d = compute(function d() {
				count("d");
				return z() + 1;
			});

			var c = compute(function c() {
				count("c");
				return d() + 1;
			});

			var b = compute(function b() {
				count("b");
				return c() + 1;
			});		

			var a = compute(function a() {
				count("a");
				return b() + z();
			});

			var changes = 0;
			a.onChange(function() {
				changes++;
			});
			changes.should.eql(0);
			counts.should.eql({
				a: 1,
				b: 1,
				c: 1,
				d: 1,
			});
			a().should.eql(5);

			z.set(5);
			// If there are multiple changes, then we might be publishing an 
			// incorrect value. At the least, it's not optimal.
			changes.should.eql(1);
			// If the counts are wrong, then the intermediate results are not 
			// caching optimally. Each one should only recompute once.
			counts.should.eql({
				a: 2,
				b: 2,
				c: 2,
				d: 2,
			});
			// If the result is wrong, then 1 or more intermediate results are 
			// being cached (rather, not recomputed before their dependents)
			// e.g., a uses b before b recomputes and gets the old value
			a().should.eql(13);
		});

		it("should release its dependencies when it no longer has dependents", function() {
			var compute = new require("../src/compute").constructor();
			var a = compute("a");
			var b = compute("b");

			var c = compute(function() {
				return a.get() + b.get();
			});

			c.onChange(noop);
			// listener, a, b & c
			Object.keys(compute.graph()).length.should.eql(4);
			c.offChange(noop);
			// all should be removed from the graph
			Object.keys(compute.graph()).length.should.eql(0);
		});
	});

	function noop() {}
	describe("batching", function() {
		var c2 = compute(function() {
			return c() * 2;
		});
		it("always returns current values", function() {
			c2.onChange(noop);
			compute.startBatch();
			c.set(123);
			c.set(456);
			c.get().should.eql(456);
			c2.get().should.eql(456 * 2);
			compute.endBatch();
			c.get().should.eql(456);
			c2.get().should.eql(456 * 2);
			c2.offChange(noop);
		});
		it("suspends events", function() {
			var changes = 0;
			function count() {
				changes++;
			}
			
			c.set(1);

			compute.startBatch();

			c2.onChange(count);
			changes.should.eql(0);
			c.set(123);
			c2.get().should.eql(123 * 2);
			changes.should.eql(0);
			c.set(456);
			c2.get().should.eql(456 * 2);
			changes.should.eql(0);

			compute.endBatch();
			c2.get().should.eql(456 * 2);
			changes.should.eql(1);

			c2.offChange(count);
		});
		it("supresses flapping", function() {
			var changes = 0;
			function count() {
				changes++;
			}
			
			c.set(123);
			c.onChange(count);

			compute.startBatch();
			
			c.set(456);
			c.set(789);
			c.set(123);

			compute.endBatch();

			changes.should.eql(0);

			c.offChange(count);
		});

		it("can roll back", function() {
			var changes = 0;
			function count() {
				changes++;
			}

			var double = compute({
				get: function double() {
					return c.get() * 2;
				},
			});
			
			c.set(123);
			double.onChange(count);

			compute.startBatch();
			
			c.set(456);
			double.get().should.eql(456 * 2);
			c.set(789);
			double.get().should.eql(789 * 2);

			compute.rollback();

			changes.should.eql(0);

			double.get().should.eql(246);
			c.get().should.eql(123);

			c.offChange(count);			
		});
	});

	describe("transaction", function() {
		it("changes no cached values until commited", function() {
			var changes = 0;
			function count() {
				changes++;
			}

			var double = compute({
				get: function double() {
					return c.get() * 2;
				},
			});
			
			c.set(123);
			double.onChange(count);

			var tx = compute.createTransaction();

			c.set(456);
			double.get().should.eql(246);
			changes.should.eql(0);

			tx.commit();
			changes.should.eql(1);
		});
		it("can roll back", function() {
			var changes = 0;
			function count() {
				changes++;
			}

			var double = compute({
				get: function double() {
					return c.get() * 2;
				},
			});
			
			c.set(123);
			double.onChange(count);

			var tx = compute.createTransaction();

			c.set(456);
			double.get().should.eql(246);
			changes.should.eql(0);

			tx.rollback();
			double.get().should.eql(246);
			changes.should.eql(0);
		});
	});

	describe("graph", function() {
		var ns = new compute.constructor();
		var a = ns(1, "a");
		var b = ns(2, "b");
		var c = ns(3, "c");
		var d = ns(function double() {
			return c() * 2;
		});
		var f = ns(function() {
			return a() * b() * d();
		}, null, "foo");
		var g = ns(function() {
			return a() * b() * c();
		}, null, "bar");

		f.onChange(noop);
		g.onChange(noop);

		it("should recursively get dependencies", function() {
			ns.graph().should.containDeep({
				V1: {
					name: "a",
				},
				V2: {
					name: "b",
				},
				V3: {
					name: "c",
				},
				C4: {
					name: "double",
					dependencies: {
						V3: true,
					}
				},
				C5: {
					name: "foo",
					dependencies: {
						V1: true,
						V2: true,
						C4: true,
					}
				},
				C6: {
					name: "bar",
					dependencies: {
						V1: true,
						V2: true,
						V3: true,
					}
				},
			});
		});

		it("should visualize dependencies", function() {
			ns.vizualize().split("\n").should.eql(["strict digraph dependencies {",
				'\t"C4" -> "V3";',
				'\t"C4"[label="double\\n(C4)"];',
				'\t"C5" -> "C4";',
				'\t"C5" -> "V1";',
				'\t"C5" -> "V2";',
				'\t"C5"[label="foo\\n(C5)"];',
				'\t"C6" -> "V1";',
				'\t"C6" -> "V2";',
				'\t"C6" -> "V3";',
				'\t"C6"[label="bar\\n(C6)"];',
				'\t"L2_noop_on_C5" -> "C5";',
				'\t"L2_noop_on_C6" -> "C6";',
				'\t"V1"[label="a\\n(V1)"];',
				'\t"V2"[label="b\\n(V2)"];',
				'\t"V3"[label="c\\n(V3)"];',
			"}"]);
		});
	});
});
/*global describe, it*/
"use strict";
var compute = require("../src/compute");
require("should");

describe("compute", function() {
	var c = compute(123);
	describe("as a value holder", function() {
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
		it("should notify on change", function() {
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
			nested.onChange(countChange, "countChange");
			a.set(5);
			nested.get().should.eql(5);
			changes.should.eql(1);

			// changing b wont change the result
			b.set(1);
			nested.get().should.eql(5);
			changes.should.eql(1);

			nested.offChange("countChange");
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
			rebind.onChange(countChange, "countChange");
			a.set(10);
			changes.should.eql(1);
			rebind().should.eql(a());

			b.set(6);
			changes.should.eql(2);
			rebind().should.eql(ab());
			rebind.offChange("countChange");
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

			c.onChange(function() {
				false.should.be.true;
			}, "should not change");

			root({
				a: 1,
				b: 2,
				c: 3,
			});
			c().should.eql(3);

			c.offChange("should not change");

			var change = 0;
			c.onChange(function() {
				c().should.eql(5);
				change++;
			}, "should coalesce changes");

			root({
				a: 2,
				b: 3,
				c: 3,
			});

			// if there was more than 1 change, then there was a change event 
			// publishing an inconsistent value
			change.should.eql(1);

			c.offChange("should coalesce changes");
		});
	});

	describe("batching", function() {
		var c2 = compute(function() {
			return c() * 2;
		});
		it("does not cache values", function() {
			c2.onChange(function() {}, "noop");
			compute.startBatch();
			c.set(123);
			c.set(456);
			c.get().should.eql(456);
			c2.get().should.eql(456 * 2);
			compute.endBatch();
			c.get().should.eql(456);
			c2.get().should.eql(456 * 2);
			c2.offChange("noop");
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

		it("should recursively get dependencies", function() {
			f.graph().should.eql({
				V1: {
					name: "a",
				},
				V2: {
					name: "b",
				},
				C4: {
					name: "double",
					dependencies: {
						V3: {
							name: "c",
						}
					}
				},
			});
		});

		it("should visualize dependencies", function() {
			ns.vizualize(f, g).should.eql("strict digraph dependencies {\n"+
				'C4[label="double\\n(C4)"];\n' +
				'C5[label="foo\\n(C5)"];\n' +
				'C6[label="bar\\n(C6)"];\n' +
				'V1[label="a\\n(V1)"];\n' +
				'V2[label="b\\n(V2)"];\n' +
				'V3[label="c\\n(V3)"];\n' +
				"C4 -> V3;\n"+
				"C5 -> C4;\n"+
				"C5 -> V1;\n"+
				"C5 -> V2;\n"+
				"C6 -> V1;\n"+
				"C6 -> V2;\n"+
				"C6 -> V3;\n"+
			"}");
		});
	});
});
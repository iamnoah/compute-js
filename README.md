## ComputeJS

A standalone implementation of computed functions, designed to integrate with your MV*/binding framework of choice.

### Values and Computed Functions

Out of the box, there are two kinds of computes: value computes and computed functions. A value compute holds a value. e.g.,

```
var count = compute.value(0);
count.get() === 0
// count() is equivalent to count.get()

count.set(count() + 1);
count() === 1

count.onChange(function updateCount() {
	$("#count").text(count());
});

// count(arg) is equivalent to count.set(arg);
count(count() + 1);
$("#count").text() === "2"

// be sure to stop observing changes when you're done
count.offChange(updateCount);
```

Value computes can hold any value, not just strings and numbers. You can store a multi-level object or an array in a value compute.

Once you have your values, you can create computed functions that track changes to those values:

```
var count = compute.value(0);
var count2 = compute.value(0);

var totalCount = compute(function() {
	return count.get() + count2.get();
});
totalCount() === "0"

totalCount.onChange(function() {
	$("#total").text(totalCount());
});

count.set(2);
count2.set(3);
$("#total").text() === "5"
```

### "Compute Nature"

Computed functions can call other functions, which can call other functions, computed functions and read from their own value computes. Any change to a computed value will trigger a change to the computed function that depends on it.

That means you only need to actually create a computed function for the final value you care about. As long as any other functions it calls have the "compute nature," it will always compute the correct result.

> A function has the compute nature if its return value is completely determined by the values of value computes (or other observable values.)

The compute nature is very powerful, but wont get in your way. You can have hundreds of lines of code that are not computes, don't deal with computes, and known nothing about computes, but can still be used in a computed function.

See "Integrating with your framework" for how other observable values can be connected to your computed functions.

### Setting values with computed functions

Value computes have a `set` method or you can pass them an argument to set their value. What about computed functions? If you call `set` or pass a value to a computed function, your function will be called with that argument. If your computed function can translate back into the computes that defined it, simply check for arguments and do so:

```
var string = compute.value("hi");
var capitalized = compute(function(newValue) {
	if (arguments.length) {
		return string.set(newValue.toLowerCase());
	}
	return string.get().toUpperCase();
});
// OR, arguably easier to read:
var capitalized = compute({
	get: function() {
		return string.get().toUpperCase();
	},
	set: function(newValue) {
		string.set(newValue.toLowerCase());
	},
});
capitalized() === "HI"

capitalized("HELLO")
string() === "hello"
```

## Custom Equality

A compute notifies its `onChange` listeners when its computed value changes. If a compute recomputes but the value does not change, then there will be no notifications.

Some computes will return an object or an array or other complex object. Most likely `===` will not be sufficient to determine if the new and old value are equivalent. In those situations, you can pass a custom equality function:

```
var arrayOfIds = compute({
	get: function() {
		// this returns a new reference every time
		return anotherArray().map(function(thing) {
			return thing.id;
		});
	},
	isEqual: function(a, b) {
		// do a deep comparison
		return _.isEqual(a, b);
	},
});
```

## Integrating with your framework

Computed functions work by recording access to value computes while the function is being evaluated. If you can find a way to record access and bind to changes in some custom class or object within your framework, you can compute with those values as well.

### Backbone

backbone-compute.js hooks into Backbone.Model's `get` (and other access methods) to give you computes. Just use `model.get` to read values from your models and you can created compute functions with them. e.g.,

```
var compute = require("backbone-compute");

var model = new MyModel({
	foo: 123,
	bar: 321,
});

var sum = compute(function() {
	return this.get("foo") + this.get("bar");
});

sum() === 444

sum.onChange(function() {
	// update the sum in your UI
	$(".sum").text(sum());
});

model.set("foo", 1);

$(".sum").text() === "322"
```

In addition to `get` and `has`, all the underscore methods (`keys`, `values`, `pairs`, `invert`, `pick`, `omit`) and `toJSON` are supported. Since they will give you a plain object to read from, a compute that depends on them will recompute any time that Model changes. You might think that is inefficient, but if you are dealing with a lot of properties, it can actually be more efficient than binding to every single property.

### Other

If you need to write your own integration, I'd recommend starting with the backbone-compute integration which is fairly straightfoward (like Backbone itself.)

## Batching

Batching can significantly improve performance if you need to make changes to several computes at the same time. In some cases, it can prevent errors by preventing inconsistent state from being used in a recompute.

`compute.startBatch` and `compute.endBatch` work as you would expect. While in a batch, `onChange` handlers are suspended. When the batch is ended, they will all fire if their values have changed. If you call `startBatch` multiple times, you have to call `endBatch` an equivalent number of times before the batch is ended.

During a batch, computes will still return the correct value. The only affect a batch has is to suspend change events.

If a compute's value changes during a batch, but returns to its original value by the end of the batch, no change event will trigger.

See tests/compute-test.js for a demonstration of batching.

### Roll Back

`compute.rollback()` will revert all changes since the start of the current batch. Since no values have changed, there will be no notifications.

`rollback` is intended for exceptional situations, so it immediately ends the current batch, even if there have been multiple calls to `startBatch`.

## Transactions

During a batch, computes are recomputed but there are no notifications until the end. This is to ensure that anything that accesses a computed result gets the right value. If you know that nothing will access a computed result (or don't care,) you can create a transaction instead.

```
var tx = compute.createTransaction();

// make changes

tx.commit(); // recompute and notify
```

`commit()` will always recompute and notify, even if the transaction is created inside another transaction or batch.

Transactions also have a `rollback()` method that will revert any changes to their values at the time the transaction was created.

## Vi(z)ualizing

As you compose a lot of computes together, it can become difficult to figure out where a value is coming from. To help you out, you can output the current dependencies in [GraphViz](http://www.graphviz.org/) format:

```
console.log(compute.vizualize());
```

You can run it through dot to get an image like this:

![Viz Graph](https://chart.googleapis.com/chart?chl=strict+digraph+dependencies+%7B%0D%0AC4%5Blabel%3D%22double%5Cn(C4)%22%5D%3B%0D%0AC5%5Blabel%3D%22foo%5Cn(C5)%22%5D%3B%0D%0AC6%5Blabel%3D%22bar%5Cn(C6)%22%5D%3B%0D%0AV1%5Blabel%3D%22a%5Cn(V1)%22%5D%3B%0D%0AV2%5Blabel%3D%22b%5Cn(V2)%22%5D%3B%0D%0AV3%5Blabel%3D%22c%5Cn(V3)%22%5D%3B%0D%0AC4+-%3E+V3%3B%0D%0AC5+-%3E+C4%3B%0D%0AC5+-%3E+V1%3B%0D%0AC5+-%3E+V2%3B%0D%0AC6+-%3E+V1%3B%0D%0AC6+-%3E+V2%3B%0D%0AC6+-%3E+V3%3B%0D%0A%7D&cht=gv "From the output of the graph in test/compute-test.js")

The part in () is the internal id of the compute. `C` indicates a computed function, while `V` indicates a value compute. `L` indicates a listener. If you use a named function for your listener, the name will be included in the id.

To make the output more useful, you should name your computes:
```
var foo = compute.value({
	value: "initialValue", // required
	name: "foo",
});

var bar = compute({
	get: ...,
	name: "bar",
});

// named functions are detected and their name is used if no other name is given
function baz() { ... }
var bazCompute = compute(baz);
```

## Acknowledgements

My first exposure to computes was in [CanJS](http://canjs.us). As far as I know [KnockoutJS](http://knockoutjs.com/) first came up with the idea.

[Steve Shipman](https://github.com/sshipman) coined the term "compute nature" and generally gives me great, thoughtful feedback on my code. Thanks Doc.

We ended up using this at Spredfast, and the resulting iteration and hardening made a much better library. Thanks to my employer for their contribution to open source.

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
capitalized() === "HI"

capitalized("HELLO")
string() === "hello"
```

## Integrating with your framework

Computed functions work by recording access to value computes while the function is being evaluated. If you can find a way to record access and bind to changes in some custom class or object within your framework, you can compute with those values as well.

### Backbone

backbone-compute.js hooks into Backbone.Model's `get` to give you computes. Just use `model.get` to read values from your models and you can created compute functions with them. e.g.,

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

### Other

If you need to write your own integration, I'd recommend starting with the backbone-compute integration which is fairly straightfoward (like Backbone itself.)

## Batching

`compute.startBatch` and `compute.endBatch` work as you would expect. While in a batch, `onChange` handlers are suspended. When the batch is ended, they will all fire if their values have changed. If you call `startBatch` multiple times, you have to call `endBatch` an equivalent number of times before the batch is ended.

During a batch, computes will still return the correct value. The only affect a batch has is to suspend change events.

## Vi(z)ualizing

As you compose a lot of computes together, it can become difficult to figure out where a value is coming from. To help you out, computes can ouput their current dependencies in [GraphViz](http://www.graphviz.org/) format:

```
console.log(compute.vizualize(aCompute, anotherCompute, etc));
```

## Acknowledgements

My first exposure to computes was in [CanJS](http://canjs.us). As far as I know [KnockoutJS](http://knockoutjs.com/) first came up with the idea.

[Steve Shipman](https://github.com/sshipman) coined the term "compute nature" and generally gives me great, thoughtful feedback on my code. Thanks Doc.

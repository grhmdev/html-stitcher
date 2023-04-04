# html-stitcher

- [About The Project](#about-the-project)
- [The Build Process](#the-build-process)
- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [Features](#features)
    * [Parameter Substitution](#parameter-substitution)
    * [Inner Substitution](#inner-substitution)
- [Examples](#examples)
- [Acknowledgements](#acknowledgements)
- [Road Map](#road-map)

## About The Project

`html-stitcher` is a CLI build tool for compiling HTML files from re-usable components. It is designed for decomposing large HTML files into smaller chunks to make them easier to work with, improving readability and allowing re-use.

To illustrate the concept, `html-stitcher` takes the files:

```html
<!-- index.html -->
<html>
<body>
    <greeting></greeting>
</body>
</html>

<!-- greeting.partial.html -->
<p>Hello from html-stitcher!</p>
```

And compiles them into:

```html
<html>
<body>
    <p>Hello from html-stitcher!</p>
</body>
</html>
```

## The Build Process

`html-stitcher` reads HTML files, which are either categorized into *root* files or *partial* files:

* Root files act as entrypoints for `html-stitcher` to process and generate output for. Output may be written to file or to the terminal to be piped elsewhere.
* Partial files are only processed when referenced by another file. The output of processing a partial file is written into the output for the file that referenced it.

Any file can include the output of a partial file in its own output by including a `<name></name>` element, where `name` is the name of the partial file, preceding the first dot.

## Installation

`npm install --save-dev html-stitcher`

## Usage

Process a single file:

`html-stitcher path/to/root/file.html`

Or process a directory:

`html-stitcher path/to/src/directory -o path/to/dist/directory`

## Options

For the full set of arguments, see `html-stitcher --help`.

### --output \<path>

- When processing a single file, `<path>` is a file where the output will be written to
- When processing a directory, `<path>` is an existing directory where all output files will be written

### --partial-files \<pattern>

- `<pattern>` is a glob pattern that `html-stitcher` uses to find **partial** files, relative to the input file or directory.

### --root-files \<pattern>

- `<pattern>` is a glob pattern that `html-stitcher` uses to find **root** files, relative to the input directory. This option is not used when processing single file inputs.

### --parameters \<params..>

- `<params..>` is a list of key-value pairs, e.g. `param1=value1 param2=value2..`, used for [Parameter Substitution](#parameter-substitution)

## Features

### Parameter Substitution

Files processed by `html-stitcher` may include `${param}` strings, where `param` is the name of a parameter value to be substituted in its place: 

```html
<!-- city.partial.html -->
<li>
    <b style="color: ${color}">${name}</b>
    <p>Population: ${population}</p>
</li>
```

Parameters can either be defined with the `--parameters` argument, or they can be defined as attributes added to the partial element of the including file:

```html
<!-- index.html -->
<h2>Largest Cities by Population</h2>
<ol>
    <!-- Each city has a `name`, `population` and `color` parameter -->
    <city name="Tokyo" population="37,468,000" color="red"></city>
    <city name="Delhi" population="28,514,000" color="blue"></city>
    <city name="Shanghai" population="25,582,000" color="green"></city>
</ol>
```

The output of processing `index.html` is:

```html
<!-- output.html -->
<h2>Largest Cities by Population</h2>
<ol>
    <li>
        <b style="color: red">Tokyo</b>
        <p>Population: 37,468,000</p>
    </li>
    <li>
        <b style="color: blue">Delhi</b>
        <p>Population: 28,514,000</p>
    </li>
    <li>
        <b style="color: green">Shanghai</b>
        <p>Population: 25,582,000</p>
    </li>
</ol>
```

### Inner Substitution

Inner substitution is a variation of parameter substitution, only the parameter name is `inner` and the parameter value is the inner HTML content of the partial element:

```html
<!-- card.partial.html -->
<div>
    <p>${inner}</p>
</div>

<!-- index.html -->
<div>
    <card>The quick brown fox jumps over the lazy dog</card>
    <card>The five boxing wizards jump quickly</card>
    <card>How vexingly quick daft zebras jump</card>
</div>

<!-- output.html -->
<div>
    <div>
        <p>The quick brown fox jumps over the lazy dog</p>
    </div>
    <div>
        <p>The five boxing wizards jump quickly</p>
    </div>
    <div>
        <p>How vexingly quick daft zebras jump</p>
    </div>
</div>
```

## Examples

This GitHub repo provides a set of minimal examples:

- [01_HelloWorld](examples/01_HelloWorld/)
- [02_ParameterSubstitution](examples/02_ParameterSubstitution/)
- [03_InnerSubstitution](examples/03_InnerSubstitution/)
- [04_Directories](examples/04_Directories/)

## Acknowledgements

Thanks to..

- [commander](https://www.npmjs.com/package/commander) for the command line interface
- [glob](https://www.npmjs.com/package/glob) for pattern based file searching
- [xml2js](https://www.npmjs.com/package/xml2js) for some minimal HTML parsing

## Road Map

- Optional end tags when including partials - i.e. allow `<greeting>` in place of `<greeting></greeting>`.
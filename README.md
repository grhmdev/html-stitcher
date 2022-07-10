# html-stitcher

`html-stitcher` is a simple CLI tool for compiling HTML files from re-usable components known as *partials*. It is designed for decomposing large HTML files to make them easier to work with, improving readability and providing the opportunity to extract repeated HTML blocks into re-usable components. Although many frontend web frameworks can provide similar functionality, `html-stitcher` is a simpler, JavaScript free, alternative that is suitable for a static website or whenever a frontend framework is not desirable.

## What Does It Do?

Let's start with a simple example to show the basic principle:

We start with an input file known as a *root* file, named `index.html`:

```html
<!-- index.html -->
<html>
<body>
    <welcome></welcome>
</body>
</html>
```
The input file includes the `<welcome></welcome>` element. This tells `html-stitcher` to substitute the element with the output of compiling `welcome.html`:

```html
<!-- welcome.html -->
<p>
    Hello world!
</p>
```

The final output generated by `html-stitcher` is simply the combination of both files:

```html
<!-- output.html -->
<html>
<body>
    <p>
        Hello world!
    </p>
</body>
</html>
```

## Features

### Parameter Substitution

Partial elements can be can be parameterised by adding additional attributes to the element's start tag:

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

Parameters in the partial file are referenced by name using the `${var}` format:

```html
<!-- city.partial.html -->
<li>
    <b style="color: ${color}">${name}</b>
    <p>Population: ${population}</p>
</li>
```

During compilation, each `${parameter}` found in the partial's HTML is substituted with the value from the including element.
In this example, the first list item has `${name}` replaced with `Tokyo` and `${color}` replaced with `red`:

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

Inner substitution is an extension of parameter substitution, only the parameter name is `inner` and the parameter value is the inner HTML content of the partial element.

```html
<!-- index.html -->
<div>
    <card>The quick brown fox jumps over the lazy dog</card>
    <card>The five boxing wizards jump quickly</card>
    <card>How vexingly quick daft zebras jump</card>
</div>
```

The inner HTML is referenced with `${inner}`:

```html
<!-- card.partial.html -->
<div>
    <p>${inner}</p>
</div>
```

As with parameter substitution, any reference to `${inner}` is replaced with the content of the including element:

```html
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

### Indentation Keeping

`html-stitcher` attempts to add-in indentation to output files. It does this by identifying the string of whitespace characters preceding a *partial*'s include element, and inserting that at the start of each line of that element's generated output:

```html
<!-- index.html -->
      <page title="..">..</page> <!-- Note: 6 space indentation -->
```

```html
<!-- page.html -->
<div class="page">
    <h1>${title}</h1>
    <p>${inner}</p>
</div>
```

```html
<!-- output.html -->
      <div class="page">
          <h1>..</h1>
          <p>..</p>
      </div>
<!-- Each line has a 6 space indentation -->
```

## Usage

> The full list of options can be viewed with `html-stitcher --help`.

`html-stitcher` requires an input path, which can either be the path to a single *root* file or a directory of *root* files to process. Depending on whether a file or directory is specified, there are some slight differences in how `html-stitcher`'s option flags are interpreted and used.

### Single File Mode

Minimum usage:

    html-stitcher /path/to/file.html

Full usage:

    html-stitcher /path/to/file.html -o /path/to/output.html -p **/*.html

By default, `html-stitcher` will write the output of the compiled file directly to the shell. The output from the run can then be piped directly into another program. The output can instead be directly written to a file using the optional `-o` (`--output`) option:

`html-stitcher` will attempt to identify *partial* files by searching the same directory as the input file using the glob pattern specified by the `-p` (`--partial-file-glob`) option. By default this option is set to `**/*.html` but it can be changed as necessary.

### Directory (Batch) Mode

Minimum usage:

    html-stitcher /path/to/src/directory -o /path/to/dist/directory

Full usage:

    html-stitcher /path/to/src/directory -o /path/to/dist/directory -r **/*[!partial].html -p **/*.html

The `-o` (`--output`) option is always required for batch mode and must be an existing *directory*. `html-stitcher` will write all compiled files to this path, maintaining the same directory path as the *root* file had relative to the input directory. For example, the output from `/{input}/dir1/dir2/file.html` will be written to `/{output}/dir1/dir2/file.html`.

When using batch mode, it is also important that *root* files and *partial* files have some kind of distinction in their names or paths so that `html-stitcher` knows not to treat *partial* files as *root* files and vice-versa. `html-stitcher` uses the options `-r` (`--root-file-glob`) and `-p` (`--partial-file-glob`) to manage this. By default, the *root* file glob is set to `**/*[!.partial].html` and the *partial* file glob is set to `**/*.html`. These defaults allow a convention of *root* file names ending in `.html` and partial file names ending in `.partial.html` to be used.

## NPM Release Roadmap

- [x] Compile single files with parameter and inner substition
- [x] Process directories of files
- [x] Document usage
- [ ] Battle-test 


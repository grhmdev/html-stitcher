#!/usr/bin/env node
"use strict";

const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const Stream = require("stream");
const xml2js = require("xml2js");

var options;
var inputArg;

const div = "==================================";
const print = (msg) => process.stdout.write(`${msg}\n`);

let log = {
    debug: (msg) => {
        if (options.verbose) {
            print(msg);
        }
    },
    info: (msg) => {
        if (options.verbose) {
            print(msg);
        }
    },
    warn: (msg) => print(msg),
};

function run() {
    const startTime = new Date().getTime();

    parseArgs();
    checkArgs();

    if (fs.lstatSync(inputArg).isFile()) {
        processFile(inputArg, options.includeFileGlob, options.output);
    } else {
        processDirectory(inputArg, options.includeFileGlob, options.buildFileGlob, options.output);
    }

    const runDuration = new Date().getTime() - startTime;
    log.info(`Finished in ${runDuration}ms`);
    process.exitCode = 0;
}

function parseArgs() {
    program
        .name("html-stitcher")
        .description("Combine multiple HTML files")
        .version("0.1.0")
        .option("-v, --verbose", "enable verbose output")
        .option(
            "-o, --output <output location>",
            "path of file or directory to write outputs to"
        )
        .option("-b, --build-file-glob", "glob pattern", "**/*[!partial].htm*")
        .option("-i, --include-file-glob", "glob pattern", "**/*.htm*")
        .option("-r, --recurse", "", false)
        .argument(
            "<input>",
            "path of base HTML file to compile, or directory containing multiple files to compile"
        );

    program.parse();

    options = program.opts();
    inputArg = program.args[0];

    if (!options.verbose) {
        log.debug = (msg) => { };
        log.info = (msg) => { };
    }
}

function checkArgs() {
    if (!fs.existsSync(inputArg)) {
        throw `Input path does not exist: ${inputArg}`;
    }

    const inputPath = path.resolve(inputArg);
    const stat = fs.lstatSync(inputPath);

    if (!(stat.isFile() || stat.isDirectory())) {
        throw `Input path is not a file or directory: ${inputPath}`;
    }
}

class FileInfo {
    constructor(filePath) {
        this.absolutePath = path.resolve(filePath);
        this.absoluteDir = path.dirname(this.absolutePath);
        this.name = path.basename(filePath);
        // Obtain the name leading up to the first "."
        this.nameStem = path.parse(filePath).name;
        const dotIndex = this.nameStem.indexOf(".");
        if (dotIndex != -1) {
            this.nameStem = this.nameStem.slice(0, dotIndex);
        }
    }
}

function processFile(inputFilePath, includeFileGlob, outputFilePath) {
    const buildableFile = new FileInfo(inputFilePath);
    const includeFiles = discoverFiles(
        buildableFile.absoluteDir,
        includeFileGlob,
        [buildableFile.absolutePath]
    );
    includeFiles.forEach( file => { log.info(`INCLUDE ${file.absolutePath}`)});
    renderHtmlFile(buildableFile, includeFiles, outputFilePath);
}

function renderHtmlFile(buildableFile, includeFiles, outputFilePath) {
    let outputStream;
    let outputStr = "";
    if (outputFilePath) {
        // Create output stream to file
        outputStream = fs.createWriteStream(outputFilePath);
        outputStream.on("close", () => {
            log.info(`OUTPUT ${outputFilePath}`);
        });
    } else {
        // Create output stream to string
        outputStream = new Stream.Writable();
        outputStream._write = (chunk, encoding, next) => {
            outputStr += chunk.toString();
            next();
        };
        outputStream.on("close", () => {
            log.info(`${div} Output ${div}`);
            print(outputStr);
        });
    }

    build(buildableFile, includeFiles, outputStream);
    outputStream.end();
}

function processDirectory(
    inputDirPath,
    includeFileGlob,
    buildFileGlob,
    outputDirPath
) {
    let buildableFiles = discoverFiles(
        inputDirPath,
        buildFileGlob
    );
    let includeFiles = discoverFiles(
        inputDirPath,
        includeFileGlob
    );
    // Remove any build files from the include files, 
    includeFiles = includeFiles.filter( includeFile => {
        return buildableFiles.find(buildableFile => buildableFile.absolutePath == includeFile.absolutePath) == undefined
    });
    includeFiles.forEach( file => { log.info(`INCLUDE ${file.absolutePath}`)});

    buildableFiles.forEach((file) => {
        const outputPath = `${outputDirPath}/${file.name}.out`;
        renderHtmlFile(file, includeFiles, outputPath);
    });
}


/** Scans an input directory using the provided glob pattern to return a list of FileInfos. */
function discoverFiles(inputDir, fileGlob, excludeList = []) {
    let htmlFiles = [];

    let includeFiles = glob.sync(`${inputDir}/${fileGlob}`);
    excludeList.forEach((path) => {
        const index = includeFiles.indexOf(path);
        if (index > -1) includeFiles.splice(index, 1);
    });
    includeFiles.forEach((path) => {
        htmlFiles.push(new FileInfo(path));
    });
    return htmlFiles;
}

/** Record of an instance of a partial element found in a file. */
class PartialElement {
    constructor(partialName, startIndex, endIndex, parameters, indent) {
        this.name = partialName; // HTML tag name
        this.startIndex = startIndex; // Index of first char (<)
        this.endIndex = endIndex; // Index of last char (>)
        this.parameters = parameters; // Object of string keys to string values
        this.indent = indent; // String of whitespace (' ', '\t') chars found preceding the startIndex char
    }
}

class FileBuffer {
    constructor(filePath) {
        this.buffer = fs.readFileSync(filePath).toString();
    }
    /** Inserts an indentation string at the start of all file lines */
    indentFile(indentStr) {
        this.buffer = this.buffer.replaceAll("\n", `\n${indentStr}`);
    }
    /** Searches for all instances of '${key}` and replaces them with `value` */
    findAndReplaceParameter(key, value) {
        const token = `\${${key}}`;
        this.buffer = this.buffer.replaceAll(token, value);
    }
    findPartial(partialName, searchFromIndex) {
        const startToken = `<${partialName}`;
        const endToken = `</${partialName}>`;

        const startIndex = this.buffer.indexOf(startToken, searchFromIndex);
        if (startIndex == -1) {
            return null;
        }

        // Try to find the element's indentation string, a continuous seqeuence of " " or "\t" chars,
        // by examining the char before the start token and scanning backwards. This indentation is
        // applied to all lines of the rendered
        let prevIndex = startIndex - 1;
        let indent = "";
        while (prevIndex >= 0) {
            const lastCharIsWs =
                this.buffer[prevIndex] == " " || this.buffer[prevIndex] == "\t";
            if (lastCharIsWs) {
                indent += this.buffer[prevIndex];
            } else {
                break;
            }
            prevIndex -= 1;
        }

        let endTagStartIndex = this.buffer.indexOf(endToken, startIndex);
        if (endTagStartIndex == -1) {
            throw `${startToken} partial element found without closing tag ${endToken}`;
        }
        const endIndex = endTagStartIndex + endToken.length;
        const htmlElement = this.buffer.substring(startIndex, endIndex);
        endTagStartIndex = htmlElement.length - endToken.length;
        const startTagEndIndex = htmlElement.indexOf(">");
        let innerRemovedHtmlElement =
            htmlElement.slice(0, startTagEndIndex + 1) +
            htmlElement.slice(-endToken.length);

        let parameters = {};
        let parser = new xml2js.Parser();
        parser.parseString(innerRemovedHtmlElement, function (err, result) {
            if (typeof result[partialName] == "object") {
                parameters = result[partialName]["$"];
                parameters["inner"] = result[partialName]["_"];
            } else {
                parameters["inner"] = result[partialName];
            }
        });
        parameters["inner"] = htmlElement.slice(
            startTagEndIndex + 1,
            endTagStartIndex
        );

        return new PartialElement(
            partialName,
            startIndex,
            endIndex,
            parameters,
            indent
        );
    }
}

/** Renders HTML for a given input file. This process has the following steps:
 *  1. The file is read into an in-memory buffer
 *  2. (For partial files) Each line of the buffered file is indented with the same
 *     indentation string that was present before the partial's include <element>.
 *     This is to try and preserve indentation levels in the final rendered HTML.
 *  3. The buffered file is searched for occurrences where parameters can be substituted.
 *     For each parameter, a find-and-replace is done to replace ${name} with the parameter's
 *     value.
 *  3. The file is scanned for a partial elements. These are identified by searching for
 *     HTML tags that correspond to the names of the include files (without extension).
 *     Each partial include file may be referenced multiple times in the same file, with
 *     different parameters.
 *  4. The partial elements identified are validated. Partial elements nested within other
 *     partial elements is not supported within the same file.
 *  5. The partial elements are then sorted by their position in the file.
 *  6. The final HTML is then composed and from the file's own HTML content interleaved
 *     with the HTML rendered for any included partial elements, and this is written to
 *     the output stream.
 */
function build(
    inputFile,
    includeFiles,
    outputStream,
    parameters = {},
    indent = ""
) {
    log.info(`BUILD ${inputFile.absolutePath}`);
    log.debug(`  parameters: ${JSON.stringify(parameters)}`);

    let fileBuffer = new FileBuffer(inputFile.absolutePath);
    fileBuffer.indentFile(indent);

    // Substitute instances of ${parameter} in file
    Object.entries(parameters).forEach(([key, value]) =>
        fileBuffer.findAndReplaceParameter(key, value)
    );

    let includeFilesWithoutSelf = includeFiles.filter(file => file.absolutePath != inputFile.absolutePath);
    let partialElements = findPartialElements(fileBuffer, includeFilesWithoutSelf);
    validatePartialElements(partialElements);
    partialElements = partialElements.sort(
        (element1, element2) => { return element1.startIndex - element2.startIndex }
    );

    let resumeIndex = 0;
    partialElements.forEach((element) => {
        const partialFile = includeFiles.find(
            (file) => file.nameStem === element.name
        );

        outputStream.write(
            fileBuffer.buffer.slice(resumeIndex, element.startIndex)
        );
        build(
            partialFile,
            includeFiles,
            outputStream,
            element.parameters,
            element.indent
        );
        resumeIndex = element.endIndex;
    });
    outputStream.write(
        fileBuffer.buffer.substring(resumeIndex, fileBuffer.buffer.length)
    );
}

/** Scans the file for and returns all instances of <partial> elements, using the name stems of the include files. */
function findPartialElements(fileBuffer, includeFiles) {
    let partialElements = [];
    includeFiles.forEach((fileInfo) => {
        let partialElement;
        let searchFromIndex = 0;
        do {
            partialElement = fileBuffer.findPartial(
                fileInfo.nameStem,
                searchFromIndex
            );
            if (partialElement) {
                partialElements.push(partialElement);
                searchFromIndex = partialElement.endIndex;
            }
        } while (partialElement != undefined);
    });
    return partialElements;
}

function validatePartialElements(partialElements) {
    partialElements.forEach((element) => {
        if (
            partialElements.find(
                (anotherElement) =>
                    anotherElement.startIndex > element.startIndex &&
                    anotherElement.startIndex < element.endIndex
            )
        ) {
            throw `${element.name} cannot contain nested partial ${anotherElement.name}`;
        }
    });
}

run();

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

const div = "================";

class Logger {
    constructor() {}
    print(msg) {
        process.stdout.write(`${msg}`);
    }
    debug(msg) {
        if (options.verbose) {
            this.print(`${msg}\n`);
        }
    }
    info(msg) {
        if (options.verbose) {
            this.print(`${msg}\n`);
        }
    }
    warn(msg) {
        this.print(`${msg}\n`);
    }
    error(msg) {
        this.print(`${msg}\n`);
    }
}
var log = new Logger();

class Timer {
    constructor() {
        this.reset();
    }
    reset() {
        this.startTime = new Date().getTime();
    }
    elapsed() {
        return new Date().getTime() - this.startTime;
    }
}

class FileInfo {
    constructor(filePath) {
        this.path = filePath;
        this.absolutePath = path.resolve(filePath);
        this.parentDir = path.dirname(this.absolutePath);
        this.name = path.basename(filePath);
        // Obtain the name leading up to the first "."
        this.nameStem = path.parse(filePath).name;
        const dotIndex = this.nameStem.indexOf(".");
        if (dotIndex != -1) {
            this.nameStem = this.nameStem.slice(0, dotIndex);
        }
    }
}

async function run() {
    try {
        const runTimer = new Timer();
        parseArgs();
        checkArgs();
        if (fs.lstatSync(inputArg).isFile()) {
            await processFile(
                inputArg,
                options.partialFileGlob,
                options.output
            );
        } else {
            const outputDir = options.output ? options.output : inputArg;
            await processDirectory(
                inputArg,
                options.partialFileGlob,
                options.rootFileGlob,
                outputDir
            );
        }
        log.info(`Finished in ${runTimer.elapsed()}ms`);
        process.exitCode = 0;
    } catch (exception) {
        log.error(`Error! : ${exception}`);
        process.exitCode = 1;
    }
}

/** Configures and parses CLI args */
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
        .option(
            "-r, --root-file-glob",
            "root file glob pattern",
            "**/*[!.partial].html"
        )
        .option(
            "-p, --partial-file-glob",
            "partial file glob pattern",
            "**/*.html"
        )
        .argument(
            "<input>",
            "path of root HTML file or directory of root HTML files to build"
        );

    program.parse();

    options = program.opts();
    inputArg = program.args[0];
}

/** Performs basic validation of CLI args */
function checkArgs() {
    // Validate input
    if (!fs.existsSync(inputArg)) {
        throw `Input path does not exist: ${inputArg}`;
    }

    const inputPath = path.resolve(inputArg);
    const inputStat = fs.lstatSync(inputPath);
    if (!(inputStat.isFile() || inputStat.isDirectory())) {
        throw `Input path is not a file or directory: ${inputArg}`;
    }

    if (inputStat.isDirectory() && !options.output) {
        throw `Output directory required for batch mode (--output) ${inputArg}`;
    }

    // Validate output
    if (options.output) {
        const outputPath = path.resolve(options.output);

        if (fs.existsSync(outputPath)) {
            const outputStat = fs.lstatSync(outputPath);
            if (!(outputStat.isFile() || outputStat.isDirectory())) {
                throw `Output path is not a file or directory: ${options.output}`;
            }

            if (outputStat.isFile()) {
                if (inputStat.isDirectory()) {
                    throw `Output path must be a directory: ${options.output}`;
                }
                if (outputPath == inputPath) {
                    throw `Output path cannot be the same as the input path: ${options.output}`;
                }
            }
        }
    }
}

async function processFile(rootFilePath, partialFileGlob, outputFilePath) {
    const rootFile = new FileInfo(rootFilePath);
    const partialFiles = discoverFiles(rootFile.parentDir, partialFileGlob, [
        rootFile.absolutePath,
    ]);
    partialFiles.forEach((file) => {
        log.info(`Found partial file ${file.path}`);
    });
    await compileHtmlFile(outputFilePath, rootFile, partialFiles, false);
}

async function processDirectory(
    inputDirPath,
    partialFileGlob,
    rootFileGlob,
    outputDirPath
) {
    if (!fs.existsSync(outputDirPath)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const absoluteInputDirPath = path.resolve(inputDirPath);

    let rootFiles = discoverFiles(inputDirPath, rootFileGlob);
    rootFiles.forEach((file) => {
        log.info(`Found root file ${file.path}`);
    });
    let partialFiles = discoverFiles(inputDirPath, partialFileGlob);
    // Remove any root files from the set of partial files
    partialFiles = partialFiles.filter((partialFile) => {
        return (
            rootFiles.find(
                (rootFile) => rootFile.absolutePath == partialFile.absolutePath
            ) == undefined
        );
    });
    partialFiles.forEach((file) => {
        log.info(`Found partial file ${file.path}`);
    });

    let timer = new Timer();
    for (let i = 0; i < rootFiles.length; ++i) {
        const file = rootFiles[i];
        timer.reset();
        const relativePathToInputDir = file.absolutePath.substring(
            absoluteInputDirPath.length,
            file.absolutePath.length
        );
        let outputPath = outputDirPath + relativePathToInputDir;

        if (outputPath == file.absolutePath) {
            outputPath += ".out";
        }
        await compileHtmlFile(outputPath, file, partialFiles, true);
        log.print(`${file.path} => ${outputPath} ${timer.elapsed()}ms\n`);
    }
}

async function compileHtmlFile(outputFilePath, rootFile, partialFiles) {
    log.info(`${div} Building ${rootFile.name}`);
    let outputStream;
    let outputStr = "";
    if (outputFilePath) {
        // Create the target file if necessary
        if (!fs.existsSync(outputFilePath)) {
            createFile(outputFilePath);
        }
        // Create output stream to file
        outputStream = fs.createWriteStream(outputFilePath);
    } else {
        // Create output stream to string
        outputStream = new Stream.Writable();
        outputStream._write = (chunk, encoding, next) => {
            outputStr += chunk.toString();
            next();
        };
        outputStream.on("close", () => {
            log.info(`${div} Output ${div}`);
            log.print(outputStr);
        });
    }
    try {
        renderHtml(rootFile, partialFiles, outputStream);
    } catch (error) {
        throw `${rootFile.path} - ${error}`;
    }
    outputStream.end();
    let promise = new Promise((fulfill) => outputStream.on("close", fulfill));
    return promise;
}

function createFile(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, "");
}

/** Scans an input directory using the provided glob pattern to return a list of FileInfos. */
function discoverFiles(inputDir, fileGlob, excludeList = []) {
    let htmlFiles = [];

    const files = glob.sync(`${inputDir}/${fileGlob}`);
    excludeList.forEach((path) => {
        const index = files.indexOf(path);
        if (index > -1) files.splice(index, 1);
    });
    files.forEach((path) => {
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
        this.filePath = filePath;
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
            throw `"${startToken}" partial element found without closing tag "${endToken}"`;
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
 *  2. (On recursion) Each line of the buffered file is indented with the same
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
function renderHtml(
    inputFile,
    partialFiles,
    outputStream,
    parameters = {},
    indent = ""
) {
    log.info(`Rendering ${inputFile.path}`);
    log.debug(`Parameters ${JSON.stringify(parameters)}`);

    let fileBuffer = new FileBuffer(inputFile.absolutePath);
    fileBuffer.indentFile(indent);

    // Substitute instances of ${parameter} in the file
    Object.entries(parameters).forEach(([key, value]) =>
        fileBuffer.findAndReplaceParameter(key, value)
    );

    // Remove this file from the list of partial files to avoid an endless recursion
    const partialFilesWithoutSelf = partialFiles.filter(
        (file) => file.absolutePath != inputFile.absolutePath
    );
    let partialElements = findPartialElements(
        fileBuffer,
        partialFilesWithoutSelf
    );
    validatePartialElements(partialElements);
    partialElements = partialElements.sort((element1, element2) => {
        return element1.startIndex - element2.startIndex;
    });

    let resumeIndex = 0;
    partialElements.forEach((element) => {
        const partialFile = partialFiles.find(
            (file) => file.nameStem === element.name
        );

        outputStream.write(
            fileBuffer.buffer.slice(resumeIndex, element.startIndex)
        );
        renderHtml(
            partialFile,
            partialFiles,
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
function findPartialElements(fileBuffer, partialFiles) {
    let partialElements = [];
    partialFiles.forEach((fileInfo) => {
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

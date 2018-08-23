import loaderUtils from 'loader-utils';
import closureTemplates from 'closure-templates';
import fs from 'fs';
import path from 'path';
import soynode from 'soynode';
import rimrafAsync from 'rimraf';

// Automatic cleanup of temporary files.

// Run the loader.
export default function(source) {
  const { cacheable, query } = this;

  if (cacheable) this.cacheable();

  const loaderCallback = this.async();
  const query2 =
		query instanceof Object ? query : loaderUtils.parseQuery(this.query);

  const { inputDir } = query2;

  let inputDir2;

  if (inputDir) {
    inputDir2 = `${inputDir}`;
  } else if (!inputDir) {
    inputDir2 = process.cwd();
  }

  const { classpath } = query2;

  let classpath2;

  if (Array.isArray(classpath)) {
    classpath2 = classpath;
  } else if (classpath) {
    classpath2 = [classpath];
  } else {
    classpath2 = [];
  }

  const { pluginModules } = query2;

  let pluginModules2;

  if (Array.isArray(classpath)) {
    pluginModules2 = pluginModules;
  } else if (classpath) {
    pluginModules2 = [pluginModules];
  } else {
    pluginModules2 = [];
  }

  // Get the configurable source of the soy runtime utilities, or use default.
  const { utils } = query2;

  const runtimeUtilsPath = require.resolve(
    utils || closureTemplates['soyutils.js']
  );
  // Create a require statement to be injected into the templates for shimming.
  const runtimeUtilsStatement = `require('exports-loader?goog,soy,soydata,soyshim!${runtimeUtilsPath}')`;
  const runtimeUtils = runtimeUtilsStatement.replace(/\\/g, '\\\\');

  this.addDependency(require.resolve(closureTemplates['soyutils.js']));
  soynode.setOptions({
    inputDir: inputDir2,
    outputDir: '/',
    uniqueDir: false,
    eraseTemporaryFiles: false,
    classpath: classpath2,
    pluginModules: pluginModules2,
  });

  // Grab namespace for shimming encapsulated module return value.
  const extracted = /\{namespace\s+((\w+)[^\s]*).*\}/.exec(source);
  const namespace = extracted[1];
  const baseVar = extracted[2];
  const tempDir = path.resolve(
    __dirname,
    [
      'soytemp', // directory prefix
      Date.now(), // datestamp
      (Math.random() * 0x100000000 + 1).toString(36), // randomized suffix
    ].join('-')
  );

  // Compile the templates to a temporary directory for reading.
  fs.mkdirAsync(tempDir)

  // Get the temp directory path
    .then(() => {
      dirPath = tempDir;
      // Handle drive letters in windows environments (C:\)
      if (dirPath.indexOf(':') !== -1) {
        dirPath = dirPath.split(':')[1];
      }
      return path.join(dirPath, 'source.soy');

      // Write the raw source template into the temp directory
    })
    .then(
      soyPath =>
        fs.writeFileAsync(path.resolve(soyPath), source).return(soyPath)

      // Run the compiler on the raw template
    )
    .then(
      soyPath => soynode.compileTemplateFilesAsync([soyPath]).return(soyPath)

      // Read the newly compiled source
    )
    .then(
      soyPath => fs.readFileAsync(`${path.resolve(soyPath)}.js`)

      // Return utils and module return value, shimmed for module encapsulation.
    )
    .then(
      template =>
        loaderCallback(
          null,
          [
            // Shims for encapsulating the soy runtime library. Normally these are exposed globally by
            // including soyutils.js. Here we encapsulate them and require them in the template.
            `var goog = ${runtimeUtils}.goog;`,
            `var soy = ${runtimeUtils}.soy;`,
            `var soydata = ${runtimeUtils}.soydata;`,
            `var soyshim = ${runtimeUtils}.soyshim;`,

            // Shims for encapsulating the compiled template.
            `var ${baseVar};`,
            template,
            `module.exports = ${namespace};`,
          ].join('\n')
        )
      // Handle any errors
    )
    .catch(
      e => loaderCallback(e)
      // Cleanup temp directory
    )
    .finally(template => rimrafAsync(tempDir).return(template));
}

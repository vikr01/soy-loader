import loaderUtils from 'loader-utils';
import closureTemplates from 'closure-templates';
import fs from 'fs';
import path from 'path';
import soynode from 'soynode';
import rimrafAsync from 'rimraf';

// Automatic cleanup of temporary files.

// Run the loader.
export default function(source) {
	if (this.cacheable) this.cacheable();
	const loaderCallback = this.async();
	const query =
		this.query instanceof Object
			? this.query
			: loaderUtils.parseQuery(this.query);
	const inputDir = query.inputDir
		? query.inputDir instanceof String
			? query.inputDir
			: `${query.inputDir}`
		: process.cwd();
	const classpath = query.classpath
		? query.classpath instanceof Array
			? query.classpath
			: [query.classpath]
		: [];
	const pluginModules = query.pluginModules
		? query.pluginModules instanceof Array
			? query.pluginModules
			: [query.pluginModules]
		: [];

	// Get the configurable source of the soy runtime utilities, or use default.
	let runtimeUtils = require.resolve(
		query.utils || closureTemplates['soyutils.js']
	);
	// Create a require statement to be injected into the templates for shimming.
	runtimeUtils = `require('exports-loader?goog,soy,soydata,soyshim!${runtimeUtils}')`;
	runtimeUtils = runtimeUtils.replace(/\\/g, '\\\\');

	this.addDependency(require.resolve(closureTemplates['soyutils.js']));
	soynode.setOptions({
		inputDir,
		outputDir: '/',
		uniqueDir: false,
		eraseTemporaryFiles: false,
		classpath,
		pluginModules,
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
	const compileContent = fs
		.mkdirAsync(tempDir)

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

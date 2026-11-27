import { copyFile, cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const frontend = new URL('../frontend/', import.meta.url);
const output = new URL('../public/', import.meta.url);

export async function buildPublicAssets(destination = output) {
  await mkdir(destination, { recursive: true });
  await Promise.all(['assets', 'services'].map((directory) =>
    cp(new URL(directory, frontend), new URL(directory, destination), { recursive: true })));
  await Promise.all(['robots.txt', 'sitemap.xml'].map((fileName) =>
    copyFile(new URL(fileName, frontend), new URL(fileName, destination))));

  // The Express application owns the HTML routes. These files preserve older static URLs.
  const legacy = [
    ['assets/images/favicon.png', 'favicon.png'],
    ['assets/js/curriculum.js', 'functions/curriculum.js'],
    ...['Photos', 'images'].map((alias) => ['assets/images', alias])
  ];
  await mkdir(new URL('functions/', destination), { recursive: true });
  await Promise.all(legacy.map(([source, target]) =>
    cp(new URL(source, frontend), new URL(target, destination), { recursive: true })));
  for (const directory of ['assets/css/', 'assets/js/']) {
    const source = new URL(directory, frontend);
    const files = await readdir(source, { withFileTypes: true });
    await Promise.all(files.filter((file) => file.isFile()).map(({ name }) =>
      copyFile(new URL(name, source), new URL(name, destination))));
  }

  const swagger = new URL('../node_modules/swagger-ui-dist/', import.meta.url);
  const swaggerOutput = new URL('api-docs/', destination);
  await mkdir(swaggerOutput, { recursive: true });
  const swaggerFiles = ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'favicon-16x16.png', 'favicon-32x32.png'];
  await Promise.all(swaggerFiles.map((name) => copyFile(new URL(name, swagger), new URL(name, swaggerOutput))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPublicAssets();

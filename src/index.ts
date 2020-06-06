#!/usr/bin/env node
import { program } from 'commander';
import fs from 'fs';
import { exec } from 'child_process';

const START_IDENTIFIER = 'REACT_NAVIGATION_GENERATION_OUTPUT:';

program.option('-o, --outputpath <path>', 'output path');

program.parse(process.argv);

if (program.outputpath) {
  // MARK requires that an ios simulator is running
  const expoProcess = exec('expo start -i');

  if (expoProcess && expoProcess.stdout) {
    expoProcess.stdout.on('data', (data: any) => {
      const output = data.toString();
      if (output.includes(START_IDENTIFIER)) {
        const routeMapJson = output.substring(
          output.indexOf(START_IDENTIFIER) + START_IDENTIFIER.length,
          output.lastIndexOf('}') + 1,
        );
        const outputPath = process.cwd() + program.outputpath;
        const tsString = `const routes = ${routeMapJson};export default routes;`;
        fs.writeFileSync(outputPath, tsString);
        expoProcess.kill();
        console.log('Route map created at ' + program.outputpath);
      }
    });
  }
} else {
  console.log('No output path');
}

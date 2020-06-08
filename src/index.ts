#!/usr/bin/env node
import program from 'commander';
import fs from 'fs';
import { exec } from 'child_process';
import { Spinner } from 'cli-spinner';
import jsyaml from 'js-yaml';
// @ts-ignore
import matchAll from 'match-all';

const START_IDENTIFIER = 'REACT_NAVIGATION_GENERATED_OUTPUT:';
const START_ROUTE_TYPES_IDENTIFIER =
  '// START react-navigation-generated types\n';
const END_ROUTE_TYPES_IDENTIFIER = '// END react-navigation-generated types\n';
const DEFAULT_APP_LOGS_TIMEOUT_SECONDS = 60;
const TYPE_IMPORT_MATCHER = /import.*{.*[A-Za-z] as (.*)Params.*}.*(?="|').*(?="|')/g;

// MARK requires import { useNavigation as _useNavigation } from '@react-navigation/native';
const USE_NAVGATION_HOOK = `const useNavigation = () => {
  const navigation = _useNavigation();
  const navigateTo: <T extends keyof NavigationParams>(
    route: { routeName: T },
    routeParams: NavigationParams[T],
  ) => void = (route, routeParams) => {
    navigation.navigate(route.routeName, routeParams);
  };
  return {
    ...navigation,
    navigateTo
  };
};

export { useNavigation };`;

program.option('-t, --timeout <timeout>', 'logs timeout seconds');
program.option('-l, --showLogs', 'display logs');
program.option('-k, --keepOpen', 'keep expo process running');
program.parse(process.argv);

type RouteMap = {
  // routeName: string
  [name: string]: RouteMap | string;
};

const getRouteMapRouteNames = (routeMap: RouteMap, routeNames: Set<string>) => {
  for (const [key, child] of Object.entries(routeMap ?? {})) {
    if (key === 'routeName' && typeof child === 'string') {
      routeNames.add(child);
    } else if (typeof child !== 'string') {
      getRouteMapRouteNames(child, routeNames);
    }
  }
};

const writeRouteParamTypes = (
  appRouteFilePath: string,
  rootNavigators: any,
) => {
  const fileData = fs.readFileSync(appRouteFilePath, 'utf8');

  const typesStartIdentifierEndIndex =
    fileData.indexOf(START_ROUTE_TYPES_IDENTIFIER) +
    START_ROUTE_TYPES_IDENTIFIER.length;
  const typesEndIdentifierEndIndex =
    fileData.indexOf(END_ROUTE_TYPES_IDENTIFIER) +
    END_ROUTE_TYPES_IDENTIFIER.length;

  const postIdentifierText = fileData.slice(typesEndIdentifierEndIndex);

  const keyToImports: Array<[string, string]> = matchAll(
    fileData,
    TYPE_IMPORT_MATCHER,
  )
    .toArray()
    .map((s: string) => [s.split('_').join('.'), s]);
  const routeNamesWithParams = new Set(keyToImports.map((o) => o[0]));

  const allRouteNames = new Set<string>();
  getRouteMapRouteNames(rootNavigators, allRouteNames);

  const typesObjString = keyToImports.reduce(
    (str, [key, val], i) =>
      str + (i === 0 ? '\n' : '') + `  '${key}': ${val}Params;\n`,
    '',
  );
  const noParamsString = [...allRouteNames]
    .filter((k) => !routeNamesWithParams.has(k))
    .reduce((str, routeName) => str + `  '${routeName}': {};\n`, '');

  const editedFileData =
    fileData.slice(0, typesStartIdentifierEndIndex) +
    `export type NavigationParams = {${
      typesObjString + '\n' + noParamsString
    }};` +
    '\n' +
    USE_NAVGATION_HOOK +
    '\n' +
    END_ROUTE_TYPES_IDENTIFIER +
    postIdentifierText;

  fs.writeFileSync(appRouteFilePath, editedFileData);
};

try {
  const configContent = fs.readFileSync(
    process.cwd() + '/rn-gen-config.yml',
    'utf8',
  );
  const { navigationroot, outputpath } = jsyaml.safeLoad(configContent);

  if (navigationroot && outputpath) {
    // MARK requires that an ios simulator is running
    console.log('Starting expo...');
    const expoProcess = exec('expo start -i');

    if (expoProcess) {
      let firstLog = false;
      let finished = false;
      let prevRouteMap: string;

      const spinner = new Spinner(
        '%s Waiting for react-navigation-generated logs...',
      );
      spinner.setSpinnerString('|/-\\');

      const waitTimeout = setTimeout(() => {
        if (!program.keepOpen) {
          expoProcess.kill();
          spinner.stop();
          console.log(
            '\nLogs timeout exceeded. No react-navigation-generated app logs found.',
          );
        }
      }, (program.timeout ?? DEFAULT_APP_LOGS_TIMEOUT_SECONDS) * 1000);

      expoProcess.stdout?.on('data', (data: any) => {
        const output = data.toString();

        if (program.showLogs) {
          console.log(output);
        }

        if (!firstLog) {
          firstLog = true;
          if (!program.keepOpen) {
            spinner.start();
          }
        }

        if (
          output.includes(START_IDENTIFIER) &&
          (!finished || program.keepOpen)
        ) {
          finished = true;
          if (!program.keepOpen) {
            expoProcess.kill();
          }
          spinner.stop();
          clearTimeout(waitTimeout);
          const routeMapJsonString = output.substring(
            output.indexOf(START_IDENTIFIER) + START_IDENTIFIER.length,
            output.lastIndexOf('}') + 1,
          );

          if (routeMapJsonString === prevRouteMap) return;
          prevRouteMap = routeMapJsonString;

          const outputPath = process.cwd() + outputpath;
          const tsString = `const routeMap = ${routeMapJsonString} as const;export default routeMap;`;
          fs.writeFileSync(outputPath, tsString);
          writeRouteParamTypes(
            process.cwd() + navigationroot,
            JSON.parse(routeMapJsonString),
          );
          console.log('\nRoute map created at ' + outputpath);
        }
      });
    }
  } else {
    console.log('Invalid configuration file');
  }
} catch (e) {
  console.log('No configuration file found');
}

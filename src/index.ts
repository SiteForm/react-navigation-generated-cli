#!/usr/bin/env node
import program from 'commander';
import fs from 'fs';
import { exec } from 'child_process';
import { Spinner } from 'cli-spinner';
import jsyaml from 'js-yaml';
// @ts-ignore
import matchAll from 'match-all';

const START_IDENTIFIER = 'REACT_NAVIGATION_GENERATED_OUTPUT:';
const END_IDENTIFIER = 'END_REACT_NAVIGATION_GENERATED';

const START_ROUTE_TYPES_IDENTIFIER =
  '// START react-navigation-generated types\n';
const END_ROUTE_TYPES_IDENTIFIER = '// END react-navigation-generated types\n';
const DEFAULT_APP_LOGS_TIMEOUT_SECONDS = 60;
const TYPE_IMPORT_MATCHER = /import.*{.*[A-Za-z] as (.*)Params.*}.*(?="|').*(?="|')/g;

// MARK requires import { useNavigation as _useNavigation } from '@react-navigation/native';
const USE_NAVGATION_HOOK = `
type NavigateToRouteParams<T extends keyof NavigationParams> = NavigationParams[T] | ExtraScreenParams<T>

type ExtraScreenParams<T extends keyof NavigationParams> = {
  screen: T,
  params: NavigateToRouteParams<keyof NavigationParams>
} & NavigationParams[T]

const useNavigation = () => {
  const navigation = _useNavigation();

  const navigateTo: <T extends keyof NavigationParams>(
    route: { routeName: T },
    routeParams: NavigateToRouteParams<T>,
  ) => void = (route, routeParams) => {
    navigation.navigate(route.routeName, routeParams);
  };

  const checkDown = (map: any, toFragment: string, level: number): {
    routeName: string,
    level: number
  } | null => {
    if (typeof map !== 'object') {
      return null;
    }
  
    if (map[toFragment]) {
      return {
        routeName: map[toFragment].routeName, 
        level
      };
    }
  
    let childrenRes: any = null;
    for (const child of Object.values(map)) {
      const childRes = checkDown(child, toFragment, level + 1);
      if (childRes) {
        if (!childrenRes) {
          childrenRes = childRes;
        } else if (childrenRes.level > childRes) {
          childrenRes = childRes;
        }
      }
    }
  
    return childrenRes;
  }
  
  const checkUp = (pathFragments: Array<string>, toFragment: string, level: number, skipKey: string): any => {
    if (pathFragments.length === 0) {
      return null;
    }
  
    let currentLevelObj: any = routeMap;
    for (const name of pathFragments) {
      currentLevelObj = currentLevelObj[name];
    }
  
    if (currentLevelObj[toFragment]) {
      return {
        routeName: currentLevelObj[toFragment].routeName,
        level,
      }
    }
  
    let downRes: any = null;
    for (const [name, child] of Object.entries(currentLevelObj)) {
      if (name !== skipKey) {
        let childRes = checkDown(child, toFragment, level + 1);
        if (childRes) {
          if (!downRes) {
            downRes = childRes;
          } else if (downRes.level > childRes) {
            downRes = childRes;
          }
        }
      }
    }
  
    const upRes = checkUp(pathFragments.slice(0, pathFragments.length - 1), toFragment, level + 1, pathFragments[pathFragments.length]);
  
    if (upRes) {
      if (downRes.level < upRes.level) {
        return downRes;
      }
      return upRes;
    }
    return downRes;
  }

  function navigateRelative<T extends keyof RouteFragmentParams>
  (from: string, toFragment: T, params: RouteFragmentParams[T]) {
    const routeFragments = from.split('.');
    const currentLevelRouteFragments = routeFragments.slice(0, routeFragments.length - 1);
  
    // //check level
    let currentLevelObj: any = routeMap;
    for (const name of currentLevelRouteFragments) {
      currentLevelObj = currentLevelObj[name];
    }

    //checkdown
    const currentObj = currentLevelObj[routeFragments[routeFragments.length - 1]];
    const downRes = checkDown(currentObj, toFragment, 0);
  
    //checkup
    const upRes = checkUp(currentLevelRouteFragments, toFragment, 0, routeFragments[routeFragments.length - 1]);
  
    if (downRes === null && upRes === null) {
      throw new Error('Invalid Fragment');
    }
  
    let routeName;
    if (downRes) {
      if (upRes) {
        if (downRes.level < upRes.level) {
          routeName = downRes.routeName;
        } else {
          routeName = upRes.routeName;
        }
      } else {
        routeName = downRes.routeName;
      }
    } else {
      routeName = upRes.routeName;
    }

    navigation.navigate(routeName, params);
  }

  return {
    ...navigation,
    navigateTo,
    navigateRelative,
  };
};

function useRoute<R extends keyof NavigationParams>(): RouteProp<NavigationParams, R> { return (_useRoute as any)()}

export { useNavigation, useRoute };
`;

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

  const fragmentRouteNames = new Set<string>();
  const fragmentRoute: any = {};
  const fragmentParams: any = {};
  const routeToImport: any = {};

  const keyToImports: Array<[string, string]> = matchAll(
    fileData,
    TYPE_IMPORT_MATCHER,
  )
    .toArray()
    .map((s: string) => {
      const sfrag = s.split('_');

      const fragName = sfrag[sfrag.length - 1];
      fragmentRouteNames.add(fragName);
      fragmentRoute[fragName] = sfrag.join('.');
      fragmentParams[fragName] = s;

      return [sfrag.join('.'), s];
    });
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

  const paramsString = [...fragmentRouteNames].reduce(
    (str, key, i) => str + (i === 0 ? '\n' : '') + `  ${key} = '${key}', \n`,
    '',
  );

  const fragString = [...fragmentRouteNames]
    .filter((k) => !routeNamesWithParams.has(k))
    .reduce(
      (str, routeName) =>
        str +
        `  '${routeName}': ${`${fragmentParams[routeName]}Params` ?? '{}'};\n`,
      '',
    );
  // const routeFragmentEnumString = [...allRouteNames]
  //   .filter(k => fragmentRouteNames())

  const editedFileData =
    fileData.slice(0, typesStartIdentifierEndIndex) +
    `export type NavigationParams = {${
      typesObjString + '\n' + noParamsString
    }};` +
    '\n' +
    `export enum RouteFragments {
      ${paramsString}
    };` +
    '\n' +
    `export type RouteFragmentParams = {
      ${fragString}
    }` +
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
  const { navigationroot, outputpath } = jsyaml.safeLoad(configContent) as any;

  if (navigationroot && outputpath) {
    // MARK requires that an ios simulator is running
    console.log('Starting expo...');
    const expoProcess = exec('expo start -i');

    if (expoProcess) {
      let firstLog = false;
      let finished = false;
      let prevRouteMap: string;

      const waitTimeout = setTimeout(() => {
        if (!program.keepOpen) {
          expoProcess.kill();
          console.log(
            '\nLogs timeout exceeded. No react-navigation-generated app logs found.',
          );
        }
      }, (program.timeout ?? DEFAULT_APP_LOGS_TIMEOUT_SECONDS) * 1000);

      let routeMapString = '';

      expoProcess.stdout?.on('data', (data: any) => {
        const output: string = data.toString();
        const outputHasIdentifier = output.includes(START_IDENTIFIER);
        const outputHasEndIdentifier = output.includes(END_IDENTIFIER);

        if (program.showLogs && !outputHasIdentifier && output.length < 1000) {
          console.log(output.trim());
        }

        if (!firstLog) {
          firstLog = true;
          if (!program.keepOpen) {
            console.log('Waiting for react-navigation-generated logs...');
          }
        }

        if (outputHasIdentifier) {
          routeMapString += output.match(
            /REACT_NAVIGATION_GENERATED_OUTPUT:(.*)/,
          )![1];
        }

        if (outputHasEndIdentifier && (!finished || program.keepOpen)) {
          finished = true;
          if (!program.keepOpen) {
            expoProcess.kill();
          }
          clearTimeout(waitTimeout);

          try {
            const parsedMap = JSON.parse(routeMapString);
            if (routeMapString === prevRouteMap) return;
            prevRouteMap = routeMapString;

            const outputPath = process.cwd() + outputpath;
            const tsString = `const routeMap = ${routeMapString} as const;export default routeMap;`;
            fs.writeFileSync(outputPath, tsString);
            writeRouteParamTypes(process.cwd() + navigationroot, parsedMap);
            console.log('\nRoute map created at ' + outputpath);
          } catch (e) {
            console.log('PARSE ERROR');
          }

          routeMapString = '';
        }
      });
    }
  } else {
    console.log('Invalid configuration file');
  }
} catch (e) {
  console.log('No configuration file found');
}

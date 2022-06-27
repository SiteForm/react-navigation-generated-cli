## Usage for Typescript Expo Managed Apps

Step 1. Install react-navigation in your expo app https://reactnavigation.org/docs/getting-started

Step 2. Install `react-navigation-generated-cli` globally.

```
npm i -g react-navigation-generated-cli
```

Step 3. Install `react-navigation-generated` in your app.

```
cd your-app
npm install react-navigation-generated
```

Step 3. Setup your screen component, and the parameters it requires from the navigator.

```typescript
import React from 'react';
import { View } from 'react-native';

type Params = {
  username: string;
};

const SignUpScreen = () => {
  return (
    <View style={{ height: 100, width: 100, backgroundColor: 'purple' }} />
  );
};

export { Params };
export default SignUpScreen;
```

Step 4. Setup root app navigation routes, param type imports, logging, and code generation markings.
`/your-app/src/index.tsx`

```typescript
import {
  logRootRoutes,
  resolveRootRoute,
  RootAppNavigators,
} from 'react-navigation-generated';
import { createStackNavigator } from '@react-navigation/stack';
// Screen parameters need to be imported as { Params as X_YParams }, where Y is a route depth below X
import SignUpScreen, {
  Params as LoginStack_SignUpParams,
} from './SignUpScreen';

const signUpParams: LoginStack_SignUpParams = {
  username: 'larry',
};

// Root navigators of your app
const rootRoutes: RootAppNavigators = {
  LoginStack: {
    container: createStackNavigator(),
    props: {
      initialRouteName: 'SignUp',
    },
    children: {
      SignUp: {
        props: {
          initialParams: signUpParams,
          component: SignUpScreen,
        },
      },
    },
  },
};

// Log your routes (only needed when generating files using cli)
logRootRoutes(rootRoutes);

// Start and end markings need to be inserted into the file
// START react-navigation-generated types
// END react-navigation-generated types

// Create your route components to use in your NavigationContainer
const LoginStack = resolveRootRoute(rootRoutes.LoginStack);

const App = () => <NavigationContainer>{LoginStack}</NavigationContainer>;

export default App;
```

Step 5. Create a config YAML file in your root app directory.
`/your-app/rn-gen-config.yml`

```yaml
navigationroot: '/src/index.tsx'
outputpath: '/src/routes.tsx'
```

Step 6. Run rn-gen from your app's root directory. An iOS simulator should be open and the expo app should be exited on it.
`/your-app`

```
rn-gen
```

Now you can use your generated files to navigate.
`/your-app/src/NewScreen.tsx`

```typescript
import { useNavigation } from './index';
import routes from './routes';

...
const navigation = useNavigation();
navigation.navigateTo(routes.LoginStack.SignUp, { username: 'bill' });
...
```

## TODO

- Combine type params across navigators.
- Route name check initial route name prop.
- Make easier to use.
- test

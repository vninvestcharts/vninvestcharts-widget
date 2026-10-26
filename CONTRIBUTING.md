#### Setting up dev environment

fork or clone the repo

```sh
$ git clone <git url>
$ cd vninvestcharts-widget
$ npm install
$ npm run watch
```

open [http://localhost:8080](http://localhost:8080) in a browser

Logging is done using the [debug](https://www.npmjs.com/package/debug) package. To see logs in the browser's development console enter this code and refresh the page: `localStorage.debug = "vninvestcharts-widget:*"`.

#### Updating documentation
Documentation details and code examples are showcased in the main demo app. To modify or add examples, update the components and configuration under `src/demo/` (such as `src/demo/LibraryShowcaseDemo.tsx`).

#### Updating source

To update the source update files under `src`

#### Help needed

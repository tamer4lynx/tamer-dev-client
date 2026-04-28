/* eslint-disable */
// @ts-nocheck
export default {
  "layouts": [
    {
      "id": "layout:/",
      "basePath": "/",
      "kind": "tab",
      "screens": [],
      "children": [
        {
          "kind": "page",
          "name": "index",
          "segmentPath": "/",
          "targetPath": "/"
        },
        {
          "kind": "page",
          "name": "about",
          "segmentPath": "/about",
          "targetPath": "/about"
        }
      ]
    }
  ],
  "routes": [
    {
      "id": "route:about",
      "routePath": "/about",
      "layoutIds": [
        "layout:/"
      ],
      "childNameByLayoutId": {
        "layout:/": "about"
      },
      "paramNames": [],
      "score": 16
    },
    {
      "id": "route:index",
      "routePath": "/",
      "layoutIds": [
        "layout:/"
      ],
      "childNameByLayoutId": {
        "layout:/": "index"
      },
      "paramNames": [],
      "score": 0
    }
  ],
  "initialPath": "/",
  "defaultPathByBasePath": {
    "/": "/",
    "/about": "/about"
  }
}

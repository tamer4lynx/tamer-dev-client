/* eslint-disable */
// @ts-nocheck
export default {
  "layouts": [
    {
      "id": "layout:/",
      "basePath": "/",
      "kind": "tab",
      "screens": [
        {
          "name": "index",
          "path": "/",
          "options": "{ \"title\": 'Connect', \"icon\": 'link', \"label\": 'Connect' }"
        },
        {
          "name": "about",
          "path": "/about",
          "options": "{ \"title\": 'About', \"icon\": 'info', \"label\": 'About' }"
        }
      ],
      "children": [
        {
          "kind": "page",
          "name": "index",
          "segmentPath": "/",
          "targetPath": "/",
          "optionsSource": "{ \"title\": 'Connect', \"icon\": 'link', \"label\": 'Connect' }"
        },
        {
          "kind": "page",
          "name": "about",
          "segmentPath": "/about",
          "targetPath": "/about",
          "optionsSource": "{ \"title\": 'About', \"icon\": 'info', \"label\": 'About' }"
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

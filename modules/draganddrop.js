import logger from '../core/logger';
import Module from '../core/module';

let imageContentTypePattern = '^image\/';

let debug = logger('quill:draganddrop');

class DragAndDrop extends Module {

  constructor(quill, options) {
    super(quill, options);

    debug.info('this.options:', this.options);
    this.container = options.container || quill.container.querySelector('.ql-editor');
    this.draggables = this.options.draggables.map(convertDraggable);
    this.listeners = new Set();

    // Drop listener
    this.addListener(this.container, 'drop', (event) => {
      let onDrop = this.options.onDrop;
      let node = event.target['ql-data'] ? event.target : this.container;
      let files = event.dataTransfer.files;
      let fileInfos = filesMatching(files, this.draggables);

      if (fileInfos.length === 0) return;

      event.stopPropagation();
      event.preventDefault();

      // call onDrop for each dropped file
      Promise.all(fileInfos.map((fileInfo) => {
        return Promise
          .resolve((onDrop || nullReturner)(fileInfo.file, {tag: fileInfo.tag, attr: fileInfo.attr}))
          .then((ret) => ({onDropRetVal: ret, fileInfo}));
      }))

      // map return vals of onDrop/nullReturner to file datas
      .then((datas) => Promise.all(datas.map(({onDropRetVal, fileInfo}) => {
        if (onDropRetVal === false) {
          // if onDrop() returned false (or a false-bearing promise), it
          // means that we shouldn't do anything with this file
          return null;
        }
        let {tag, attr} = fileInfo;
        // if ret is null, either onDrop() returned null (or a null-
        // bearing promise), or onDrop isn't defined, so just use the
        // file's base64 as the value for tag[draggable.attr]
        //
        // if ret is non-false and non-null, it means onDrop returned
        // something (or promised something) that isn't null or false.
        // Assume it's what we should use for tag[draggable.attr]
        let data;
        if (onDropRetVal === null)
          data = getFileDataUrl(fileInfo.file);
        else
          data = onDropRetVal;

        return Promise
          .resolve(data)
          .then((ret) => ({data: ret, tag, attr}));
      })))
      .then((datas) => datas.forEach((fileInfo) => {
        // loop through each fileInfo and attach them to the editor

        // fileInfo is undefined if onDrop returned false
        if (fileInfo) {
          let {data, tag, attr} = fileInfo;
          if (tag == 'img') {
            let range = this.quill.getSelection();
            this.quill.insertEmbed((range ? range.index : this.quill.getLength()), 'image', data);
          } else {
            let newElement = document.createElement(tag);
            newElement.setAttribute(attr, data);
            node.appendChild(newElement);
          }
        }
      }));
    });
  }

  addListener(node, eventName, listenerFn) {
    let listener = listenerFn.bind(this);
    node.addEventListener(eventName, listener, false);
    this.listeners.add({node, eventName, listener});
  }
}

DragAndDrop.DEFAULTS = {
  container: null,
  draggables: [
    {
      contentTypePattern: imageContentTypePattern,
      tag: 'img',
      attr: 'src'
    }
  ],
  onDrop: null,
  draggableContentTypePatterns: [
    imageContentTypePattern
  ]
};

function convertDraggable(draggable) {
  if (draggable.contentTypePattern && draggable.tag && draggable.attr) {
    let ret = Object.assign({}, draggable);
    ret.contentTypeRegex = new RegExp(draggable.contentTypePattern);
    delete ret.contentTypePattern;
    return ret;
  } else {
    let e = new Error("draggables should have contentTypePattern, tag and attr keys");
    e.invalidDraggable = draggable;
    throw e;
  }
}

function filesMatching(fileList, draggables) {
  let ret = [];
  for (let i = 0; i < fileList.length; i++) {
    let file = fileList.item(i);
    let draggable = draggables.find((d) => d.contentTypeRegex.test(file.type));
    draggable && ret.push({file, tag: draggable.tag, attr: draggable.attr});
  }
  return ret;
}

function getFileDataUrl(file) {
  let reader = new FileReader();
  return new Promise((resolve) => {
    reader.addEventListener("load", function () {
      resolve(reader.result);
    }, false);
    reader.readAsDataURL(file);
  });
}

function nullReturner() {
  return null;
}

function utils() {
  return {
    getFileDataUrl
  }
}

export { DragAndDrop as default, utils, imageContentTypePattern };

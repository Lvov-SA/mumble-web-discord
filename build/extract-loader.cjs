// Evaluate generated HTML/CSS with webpack's module executor. This avoids the
// abandoned extract-loader and its Babel 6 dependency tree.
module.exports = function () {}
module.exports.pitch = function (remainingRequest) {
  const callback = this.async()
  this.importModule(
    `${this.resourcePath}.webpack[javascript/auto]!=!!!${remainingRequest}`,
    { publicPath: '' },
    (error, exports) => {
      if (error) return callback(error)
      const content = exports.default === undefined ? exports : exports.default
      callback(null, content.toString())
    }
  )
}

(function (window) {
  var bpm = {
    // TODO: Add configuration, make customizable
  };
  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

  bpm.init_display = function (canvas) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 240;
  };

  bpm.refresh_display = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.drawctx.fillStyle = '#ffffcc';
    this.drawctx.fillRect(0, 0, w, h);
    // For testing
    this.drawctx.beginPath();
    this.drawctx.arc(
      w / 2, Math.max(0, Math.pow(1 - (Date.now() - this.last_pat) / 200, 3)) * h + 10,
      10, 0, 2 * Math.PI);
    this.drawctx.fillStyle = '#bbbb88';
    this.drawctx.fill();
    window.requestAnimationFrame(this.ticker);
  };

  bpm.pat = function () {
    this.last_pat = Date.now();
  };

  bpm.create = function (id) {
    if (typeof id !== 'string') {
      console.log('BPM.create(): id cannot be null');
      return undefined;
    }
    var canvas = document.getElementById(id);
    if (!canvas || canvas.tagName.toUpperCase() !== 'CANVAS') {
      console.log('BPM.create(): id should correspond to a <canvas> element');
      return false;
    }
    bpm.init_display(canvas);
	
    var ret = {};
    ret.canvas = canvas;
    ret.drawctx = canvas.getContext('2d');
    ret.last_pat = Date.now();
    ret.refresh_display = bpm.refresh_display;
    ret.pat = bpm.pat;
    ret.ticker = (function (_ret) { return function () { _ret.refresh_display(); }; })(ret);
    window.requestAnimationFrame(ret.ticker);
    return ret;
  };

  window.bpm = bpm;
})(window);

(function (window) {
  var bpm = {
    // TODO: Add configuration, make customizable
  };

  bpm.init_display = function (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = 240;
  };

  bpm.display = function (id) {
    if (typeof id !== 'string') {
      console.log('BPM.display(): id cannot be null');
      return undefined;
    }
    var canvas = document.getElementById(id);
    if (!canvas || canvas.tagName.toUpperCase() !== 'CANVAS') {
      console.log('BPM.display(): id should correspond to a <canvas> element');
      return false;
    }
    bpm.init_display(canvas);
  };

  window.bpm = bpm;
})(window);

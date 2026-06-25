const wxStorage = {
  getItem(k) {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      try { return wx.getStorageSync(k) || null; } catch { return null; }
    }
    return null;
  },
  setItem(k, v) {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      try { wx.setStorageSync(k, v); } catch { /* ignore */ }
    }
  },
  removeItem(k) {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) {
      try { wx.removeStorageSync(k); } catch { /* ignore */ }
    }
  }
};

module.exports = { wxStorage };

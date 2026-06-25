App({
  onLaunch() {
    // 上线前取消注释：强制更新
    // const mgr = wx.getUpdateManager();
    // mgr.onUpdateReady(() => wx.showModal({ title: '更新提示', content: '新版本已准备好，是否重启应用？', success: res => { if (res.confirm) mgr.applyUpdate(); } }));
  }
});

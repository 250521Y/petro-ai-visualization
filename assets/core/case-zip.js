/* ZIP case packages; JSZip is bundled locally (MIT), no server or CDN needed. */
(function (global) {
  'use strict';

  var MAX_TOTAL = 6 * 1024 * 1024;
  var MAX_ENTRIES = 512;

  // Check expanded sizes before asking JSZip to decompress the package.
  function inspect(buffer) {
    var view = new DataView(buffer), end = -1;
    for (var p = view.byteLength - 22; p >= Math.max(0, view.byteLength - 65557); p--) {
      if (view.getUint32(p, true) === 0x06054b50 &&
          p + 22 + view.getUint16(p + 20, true) === view.byteLength) { end = p; break; }
    }
    if (end < 0) throw new Error('压缩包已损坏，或不是有效的 ZIP 文件。');
    var count = view.getUint16(end + 10, true);
    var size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
        view.getUint16(end + 8, true) !== count) throw new Error('不支持分卷 ZIP，请合并成一个普通 ZIP 后导入。');
    if (count === 65535 || size === 0xffffffff || offset === 0xffffffff)
      throw new Error('请使用普通 ZIP 格式，案例包无需使用 ZIP64。');
    if (count > MAX_ENTRIES) throw new Error('压缩包条目超过 512 个，请精简案例包。');
    if (offset + size !== end) throw new Error('压缩包目录不完整，请重新压缩后导入。');
    var total = 0, pos = offset;
    for (var i = 0; i < count; i++) {
      if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50)
        throw new Error('压缩包目录已损坏，请重新压缩后导入。');
      if (view.getUint16(pos + 8, true) & 1) throw new Error('不支持加密 ZIP，请取消密码后重新压缩。');
      total += view.getUint32(pos + 24, true);
      if (total > MAX_TOTAL) throw new Error('解压后的文件总大小超过 6 MB，请精简示范素材。');
      pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
      if (pos > end) throw new Error('压缩包目录已损坏，请重新压缩后导入。');
    }
    if (pos !== end) throw new Error('压缩包目录已损坏，请重新压缩后导入。');
  }

  function decodeName(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); }
    catch (e) { return new TextDecoder('gb18030').decode(new Uint8Array(bytes)); }
  }

  function read(file) {
    if (!global.JSZip) return Promise.reject(new Error('ZIP 解压组件未加载，请刷新网页并确认部署文件完整。'));
    if (file.size > MAX_TOTAL) return Promise.reject(new Error('ZIP 文件超过 6 MB，请精简后导入。'));
    return file.arrayBuffer().then(function (buffer) {
      inspect(buffer);
      return global.JSZip.loadAsync(buffer, { checkCRC32: true, decodeFileName: decodeName });
    }).then(function (zip) {
      var entries = Object.keys(zip.files).map(function (name) { return zip.files[name]; }).filter(function (entry) {
        return !entry.dir && !/(^|\/)(__MACOSX|\.DS_Store|\._[^/]*)(\/|$)/.test(entry.name);
      });
      if (!entries.length) throw new Error('压缩包内没有可导入的文件。');
      var seen = Object.create(null);
      entries.forEach(function (entry) {
        var name = (entry.unsafeOriginalName || entry.name).replace(/\\/g, '/');
        if (/^(\/|[a-z]:)/i.test(name) || name.split('/').indexOf('..') >= 0 || /\0/.test(name))
          throw new Error('压缩包包含无效路径，请重新压缩案例文件夹。');
        name = name.replace(/^(\.\/)+/, '');
        if (seen[name]) throw new Error('压缩包内存在重复文件路径：' + name);
        seen[name] = true;
        entry.casePath = name;
      });
      var manifests = entries.filter(function (entry) { return /(^|\/)(case|[a-z0-9._-]+\.case)\.json$/i.test(entry.casePath); });
      if (!manifests.length) throw new Error('压缩包内没有找到 case.json 清单，请选择完整的案例包。');
      if (manifests.length > 1) throw new Error('压缩包内有多个案例清单，请每次导入一个案例 ZIP。');
      return Promise.all(entries.map(function (entry) {
        return entry.async('uint8array').then(function (bytes) {
          var result = new File([bytes], entry.casePath.split('/').pop());
          Object.defineProperty(result, 'webkitRelativePath', { value: entry.casePath });
          return result;
        });
      }));
    }).catch(function (error) {
      if (/CRC32|Corrupted|compression|signature|encrypted|end of data/i.test(error.message))
        throw new Error('ZIP 已损坏、已加密或使用了不支持的压缩方式，请重新压缩为普通 ZIP。');
      throw error;
    });
  }

  global.CaseZip = { read: read };
})(window);

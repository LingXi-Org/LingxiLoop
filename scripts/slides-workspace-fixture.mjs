export function addLegacyMedia(files, firstSlidePath) {
  files.set(firstSlidePath, Buffer.from(files.get(firstSlidePath).toString().replace('</section>', '<video src="/_blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" aria-label="旧媒体"></video><img data-video-youtube="abcdefghijk" alt="旧链接"></section>')))
  return files
}

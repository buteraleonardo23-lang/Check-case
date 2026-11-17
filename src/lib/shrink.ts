/** Riduce la foto prima dell'upload (~1600px, JPEG 0.75): poche centinaia di KB invece di qualche MB. */
export async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas')
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.75))
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

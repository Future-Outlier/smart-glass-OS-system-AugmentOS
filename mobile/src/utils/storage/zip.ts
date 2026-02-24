import {Directory, File, Paths} from "expo-file-system"
import {unzip} from "react-native-zip-archive"

// export async function downloadFile(url: string, destination: Directory): Promise<File> {}

export function printDirectory(directory: Directory, indent: number = 0) {
  console.log(`${" ".repeat(indent)} + ${directory.name}`)
  const contents = directory.list()
  for (const item of contents) {
    if (item instanceof Directory) {
      printDirectory(item, indent + 2)
    } else {
      console.log(`${" ".repeat(indent + 2)} - ${item.name} (${item.size} bytes)`)
    }
  }
}

export async function downloadAndInstallMiniApp(url: string): Promise<void> {
  let downloadedZipPath: string = ""

  // create the download directory if it doesn't exist
  const downloadDir = new Directory(Paths.cache, "lma_downloads")
  try {
    if (!downloadDir.exists) {
      downloadDir.create()
    }
  } catch (error) {
    console.error("ZIP: Error creating download directory", error)
    throw "CREATE_DOWNLOAD_DIR_FAILED"
  }

  try {
    const output = await File.downloadFileAsync(url, downloadDir)
    downloadedZipPath = output.uri
  } catch (error) {
    let errorMessage = error + ""
    if (errorMessage.includes("already exists")) {
      console.log("ZIP: File already exists, skipping download")
      downloadedZipPath = `${Paths.cache.uri}/lma_downloads/${url.split("/").pop()}`
    } else {
      console.error("ZIP: Error downloading zip file", error)
      throw "DOWNLOAD_FAILED"
    }
  }

  console.log("ZIP: done downloading, starting unzip")

  const unzipDir = new Directory(Paths.cache, "lma_unzip")
  try {
    if (!unzipDir.exists) {
      unzipDir.create()
    } else {
      // delete the directory, then create it
      unzipDir.delete()
      unzipDir.create()
    }
  } catch (error) {
    console.error("ZIP: Error creating or deleting the unzip directory", error)
    throw "CREATE_CACHE_DIR_FAILED"
  }

  let res = null
  try {
    console.log("ZIP: unzipping", downloadedZipPath)
    console.log("ZIP: unzip directory", unzipDir.uri)
    res = await unzip(downloadedZipPath, unzipDir.uri)
    // console.log(unzipOutput.exists) // true
    // console.log(unzipOutput.uri) // path to the unzipped file, e.g., '${cacheDirectory}/pdfs/sample.pdf'
  } catch (error) {
    console.error("Error unzipping zip file", error)
    throw "UNZIP_FAILED"
  }

  console.log("ZIP: done unzipping", res)

  // get the package name and info from the app.json file:
  let packageName = null
  let version = null
  let folderName = null
  try {
    const firstFile = unzipDir.list()[0] // this should be the folder containing the app.json file
    folderName = firstFile.name
    // read firstFile/app.json:
    const appJsonFile = new File(firstFile as Directory, "app.json")
    const appJson = JSON.parse(appJsonFile.textSync())
    packageName = appJson.packageName
    version = appJson.version

    console.log("ZIP: package name", packageName)
    console.log("ZIP: version", version)
  } catch (error) {
    console.error("Error reading the app.json file", error)
    throw "READ_APP_JSON_FAILED"
  }

  // move the contents of this folder to Documents/lmas/<version>/<packageName>

  const basePackageDir = new Directory(Paths.document, "lmas", packageName)
  try {
    if (!basePackageDir.exists) {
      basePackageDir.create({intermediates: true})
    }
  } catch (error) {
    console.error("Error creating the base package directory", error)
    throw "CREATE_PACKAGE_DIR_FAILED"
  }

  // create the version directory
  const versionDir = new Directory(basePackageDir, version)
  try {
    if (!versionDir.exists) {
      versionDir.create()
    } else {
      // delete the directory, then create it
      versionDir.delete()
      versionDir.create()
    }
  } catch (error) {
    console.error("Error creating the version directory", error)
    throw "CREATE_VERSION_DIR_FAILED"
  }

  // move the contents of the folder to the destination directory
  try {
    const folder = new Directory(unzipDir, folderName)
    const contents = folder.list()
    for (const item of contents) {
      item.move(versionDir)
    }
  } catch (error) {
    console.error("Error moving the contents of the folder to the destination directory", error)
    throw "INSTALL_CONTENTS_FAILED"
  }

  console.log("ZIP: local mini app installed at", versionDir.uri)
  printDirectory(versionDir, 2)

  //   printDirectory(unzipDir)
  //   printDirectory(downloadDir)
  //   printDirectory(new Directory(res))

  // get the version of the mini app from the zip file:

  //   console.log("ZIP: done unzipping: ${res}")
}

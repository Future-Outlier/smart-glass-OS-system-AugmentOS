import Foundation
import SWCompression

@objc(TarBz2Extractor)
public class TarBz2Extractor: NSObject {
    @objc
    public static func extractTarBz2From(
        _ sourcePath: String,
        to destinationPath: String,
        error errorPointer: NSErrorPointer
    ) -> Bool {
        Bridge.log("TarBz2Extractor: begin extraction from \(sourcePath)")
        do {
            try performExtraction(from: sourcePath, to: destinationPath)
            Bridge.log("TarBz2Extractor: extraction complete")
            return true
        } catch let extractionError as NSError {
            Bridge.log("TarBz2Extractor: failed - \(extractionError.localizedDescription)")
            errorPointer?.pointee = extractionError
            return false
        } catch {
            let nsError = NSError(
                domain: "TarBz2Extractor",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
            )
            Bridge.log("TarBz2Extractor: failed - \(error.localizedDescription)")
            errorPointer?.pointee = nsError
            return false
        }
    }

    private static func performExtraction(from sourcePath: String, to destinationPath: String) throws {
        Bridge.log("TarBz2Extractor: creating destination directory")
        let fileManager = FileManager.default
        try fileManager.createDirectory(
            atPath: destinationPath,
            withIntermediateDirectories: true,
            attributes: nil
        )

        Bridge.log("TarBz2Extractor: decompressing bzip2 archive")
        let tempTarURL = try decompressBzipArchive(at: sourcePath)
        defer {
            Bridge.log("TarBz2Extractor: cleaning up temporary files")
            try? fileManager.removeItem(at: tempTarURL)
        }

        Bridge.log("TarBz2Extractor: extracting tar archive")
        try extractTarArchive(at: tempTarURL, to: destinationPath)

        Bridge.log("TarBz2Extractor: flattening directory structure")
        try flattenNestedDirectory(at: destinationPath)
    }

    private static func decompressBzipArchive(at sourcePath: String) throws -> URL {
        let tempTarURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("tar")

        let sourceURL = URL(fileURLWithPath: sourcePath)

        Bridge.log("TarBz2Extractor: reading compressed data")
        let compressedData = try Data(contentsOf: sourceURL)
        let compressedSizeMB = Double(compressedData.count) / (1024 * 1024)
        Bridge.log("TarBz2Extractor: compressed size: \(String(format: "%.2f", compressedSizeMB)) MB")

        Bridge.log("TarBz2Extractor: decompressing data")
        guard let decompressedData = try? BZip2.decompress(data: compressedData) else {
            throw makeError(code: 1003, message: "Unable to decompress bzip2 archive")
        }

        let decompressedSizeMB = Double(decompressedData.count) / (1024 * 1024)
        Bridge.log("TarBz2Extractor: decompressed size: \(String(format: "%.2f", decompressedSizeMB)) MB")

        Bridge.log("TarBz2Extractor: writing temporary tar file")
        try decompressedData.write(to: tempTarURL, options: .atomic)

        return tempTarURL
    }

    private static func extractTarArchive(at tarURL: URL, to destinationPath: String) throws {
        let destinationRoot = URL(fileURLWithPath: destinationPath, isDirectory: true)
        let fileManager = FileManager.default

        let handle = try FileHandle(forReadingFrom: tarURL)
        defer { try? handle.close() }

        var reader = TarReader(fileHandle: handle)
        var entryCount = 0
        var fileCount = 0
        var dirCount = 0

        while let entry = try reader.read() {
            entryCount += 1

            let sanitizedName = sanitize(entryName: entry.info.name)
            if sanitizedName.isEmpty {
                continue
            }

            let entryURL = destinationRoot.appendingPathComponent(sanitizedName)
            switch entry.info.type {
            case .directory:
                dirCount += 1
                try fileManager.createDirectory(
                    at: entryURL,
                    withIntermediateDirectories: true,
                    attributes: nil
                )
                if dirCount % 10 == 0 {
                    Bridge.log("TarBz2Extractor: created \(dirCount) directories")
                }
            case .regular:
                guard let data = entry.data else { continue }
                fileCount += 1
                try fileManager.createDirectory(
                    at: entryURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true,
                    attributes: nil
                )
                let finalURL = remapModelFileIfNeeded(for: entryURL)
                try data.write(to: finalURL, options: .atomic)

                if fileCount % 10 == 0 {
                    Bridge.log("TarBz2Extractor: extracted \(fileCount) files")
                }
            default:
                continue
            }
        }

        Bridge.log("TarBz2Extractor: extracted \(fileCount) files and \(dirCount) directories (total \(entryCount) entries)")
    }

    private static func flattenNestedDirectory(at destinationPath: String) throws {
        let fileManager = FileManager.default
        let destinationURL = URL(fileURLWithPath: destinationPath, isDirectory: true)
        let nestedURL = destinationURL.appendingPathComponent(destinationURL.lastPathComponent)

        guard fileManager.fileExists(atPath: nestedURL.path) else {
            Bridge.log("TarBz2Extractor: no nested directory to flatten")
            return
        }

        Bridge.log("TarBz2Extractor: flattening nested directory structure")
        let nestedFiles = try fileManager.contentsOfDirectory(at: nestedURL, includingPropertiesForKeys: nil)
        Bridge.log("TarBz2Extractor: moving \(nestedFiles.count) items")

        for file in nestedFiles {
            let target = destinationURL.appendingPathComponent(file.lastPathComponent)
            if fileManager.fileExists(atPath: target.path) {
                try fileManager.removeItem(at: target)
            }
            try fileManager.moveItem(at: file, to: target)
        }

        try fileManager.removeItem(at: nestedURL)
        Bridge.log("TarBz2Extractor: flattening complete")
    }

    private static func sanitize(entryName: String) -> String {
        var name = entryName

        if name.hasPrefix("./") {
            name.removeFirst(2)
        }
        while name.hasPrefix("/") {
            name.removeFirst()
        }

        guard !name.isEmpty else { return "" }

        var components = name.split(separator: "/").map(String.init)
        guard !components.isEmpty else { return "" }

        if components.count > 1 {
            components.removeFirst()
            name = components.joined(separator: "/")
        } else {
            name = components[0]
        }

        return name
    }

    private static func remapModelFileIfNeeded(for url: URL) -> URL {
        let parent = url.deletingLastPathComponent()
        switch url.lastPathComponent {
        case "encoder-epoch-99-avg-1.onnx":
            return parent.appendingPathComponent("encoder.onnx")
        case "decoder-epoch-99-avg-1.onnx":
            return parent.appendingPathComponent("decoder.onnx")
        case "joiner-epoch-99-avg-1.int8.onnx":
            return parent.appendingPathComponent("joiner.onnx")
        default:
            return url
        }
    }

    private static func makeError(code: Int, message: String) -> NSError {
        return NSError(
            domain: "TarBz2Extractor",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

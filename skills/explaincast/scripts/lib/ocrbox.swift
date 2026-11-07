// ocrbox <image> <text>: where <text> first appears in the image, as
// "x y w h" fractions of it (top-left origin). Exits 1 when it isn't there.
import AppKit
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3,
      let image = NSImage(contentsOfFile: args[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: ocrbox <image> <text>\n".data(using: .utf8)!)
    exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first,
          let range = candidate.string.range(of: args[2], options: .caseInsensitive),
          let box = try? candidate.boundingBox(for: range)?.boundingBox else { continue }
    print(box.minX, 1 - box.maxY, box.width, box.height)
    exit(0)
}
exit(1)

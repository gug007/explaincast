// ocr <image>... : prints "<image>\t<text>" for every line of text Vision
// reads in each image, images in the order given.
import AppKit
import Foundation
import Vision

// EXPLAINCAST_OCR_LANGS ("zh-Hans,en-US"), set by make.js for a Chinese
// video, picks the languages to read; without it Vision reads English only.
let languages = (ProcessInfo.processInfo.environment["EXPLAINCAST_OCR_LANGS"] ?? "")
    .split(separator: ",").map(String.init).filter { !$0.isEmpty }
let files = Array(CommandLine.arguments.dropFirst())
var found = [[String]](repeating: [], count: files.count)
let lock = NSLock()

DispatchQueue.concurrentPerform(iterations: files.count) { i in
    guard let image = NSImage(contentsOfFile: files[i]),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    if !languages.isEmpty { request.recognitionLanguages = languages }
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    lock.lock()
    found[i] = lines
    lock.unlock()
}

for (i, file) in files.enumerated() {
    for line in found[i] { print("\(file)\t\(line)") }
}

export * from "@xcrap/extractor"
export * from "@xcrap/xml-extractor"

// Both packages export extractors with these names (one set for HTML elements, one for XML nodes).
// At the top level they are the HTML ones; the XML ones live in the `xml` namespace below.
export {
    extractAttribute,
    extractChildElementCount,
    extractLocalName,
    extractRawText,
    extractTagName,
    extractText,
    fromNextElementSibling,
    fromPreviousElementSibling,
    matchRegexFrom,
} from "@xcrap/extractor"

export * as xml from "@xcrap/xml-extractor"

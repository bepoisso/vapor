//! Steam news contents (BBCode, sometimes HTML) turned into plain structured blocks. Nothing from
//! the post is ever rendered as markup: the UI draws these blocks with its own elements, so a
//! post cannot inject scripts, styles or remote content. Unknown tags are dropped, their text
//! kept.

use serde::Serialize;
use specta::Type;

/// Steam's placeholder for its clan image host in BBCode posts.
const CLAN_IMAGE_PLACEHOLDER: &str = "{STEAM_CLAN_IMAGE}";
const CLAN_IMAGE_HOST: &str = "https://clan.akamai.steamstatic.com/images";

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NewsBlock {
    Heading {
        text: String,
    },
    Paragraph {
        spans: Vec<Span>,
    },
    ListItem {
        spans: Vec<Span>,
    },
    /// `src` is a `vapor://` URL once the image is resolved (see `game::news`).
    Image {
        src: String,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
pub struct Span {
    pub text: String,
    /// An `http(s)` link, opened in the browser.
    pub href: Option<String>,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, PartialEq)]
enum Token<'a> {
    Text(&'a str),
    Tag {
        name: String,
        closing: bool,
        /// `[url=…]`, `<a href=…>`, `<img src=…>`.
        value: Option<String>,
    },
}

/// Splits `input` into text and tags. A `[` or `<` that does not start a well-formed tag is
/// text.
fn tokenize(input: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut text_start = 0;
    let mut index = 0;
    let bytes = input.as_bytes();
    while index < bytes.len() {
        let close = match bytes[index] {
            b'[' => b']',
            b'<' => b'>',
            _ => {
                index += 1;
                continue;
            }
        };
        let Some(length) = input[index + 1..].find(close as char) else {
            break;
        };
        let inner = &input[index + 1..index + 1 + length];
        match parse_tag(inner, close == b'>') {
            Some(tag) => {
                if text_start < index {
                    tokens.push(Token::Text(&input[text_start..index]));
                }
                tokens.push(tag);
                index += length + 2;
                text_start = index;
            }
            None => index += 1,
        }
    }
    if text_start < input.len() {
        tokens.push(Token::Text(&input[text_start..]));
    }
    tokens
}

fn parse_tag(inner: &str, html: bool) -> Option<Token<'static>> {
    let (closing, body) = match inner.strip_prefix('/') {
        Some(rest) => (true, rest),
        None => (false, inner),
    };
    let body = body.trim_end_matches('/').trim();
    let name_end = body
        .find(|c: char| c == '=' || c.is_whitespace())
        .unwrap_or(body.len());
    let name = &body[..name_end];
    let valid_name = name == "*"
        || (!name.is_empty()
            && name.len() <= 16
            && name.chars().all(|c| c.is_ascii_alphanumeric()));
    if !valid_name {
        return None;
    }
    let rest = &body[name_end..];
    let value = if html {
        html_attribute(rest, "href").or_else(|| html_attribute(rest, "src"))
    } else {
        rest.strip_prefix('=').map(|value| unquote(value.trim()))
    };
    Some(Token::Tag {
        name: name.to_ascii_lowercase(),
        closing,
        value,
    })
}

fn unquote(value: &str) -> String {
    value
        .trim_matches(|c| c == '"' || c == '\'')
        .trim()
        .to_owned()
}

fn html_attribute(attributes: &str, name: &str) -> Option<String> {
    let lower = attributes.to_ascii_lowercase();
    let mut search = 0;
    while let Some(found) = lower[search..].find(name) {
        let start = search + found;
        let after = lower[start + name.len()..].trim_start();
        let before_ok = start == 0 || lower.as_bytes()[start - 1].is_ascii_whitespace();
        if before_ok && let Some(value) = after.strip_prefix('=') {
            let offset = attributes.len() - value.len();
            let value = attributes[offset..].trim_start();
            let quote = value.chars().next()?;
            let raw = if quote == '"' || quote == '\'' {
                let end = value[1..].find(quote)?;
                &value[1..=end]
            } else {
                value.split_whitespace().next()?
            };
            return Some(raw.to_owned());
        }
        search = start + name.len();
    }
    None
}

/// Decodes the HTML entities Steam posts use.
fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        let decoded = rest[1..]
            .find(';')
            .filter(|&end| end <= 10)
            .and_then(|end| {
                let entity = &rest[1..=end];
                let character = match entity {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    _ => entity
                        .strip_prefix("#x")
                        .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                        .or_else(|| entity.strip_prefix('#').and_then(|dec| dec.parse().ok()))
                        .and_then(char::from_u32),
                }?;
                Some((character, end + 2))
            });
        match decoded {
            Some((character, length)) => {
                out.push(character);
                rest = &rest[length..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Absolute `http(s)` URL, with Steam's clan image placeholder resolved.
pub fn resolve_url(raw: &str) -> Option<String> {
    let url = decode_entities(raw.trim());
    let url = match url.strip_prefix(CLAN_IMAGE_PLACEHOLDER) {
        Some(path) => format!("{CLAN_IMAGE_HOST}{path}"),
        None => url,
    };
    (url.starts_with("https://") || url.starts_with("http://")).then_some(url)
}

#[derive(Clone, Copy, PartialEq)]
enum BlockKind {
    Paragraph,
    ListItem,
}

/// Collects raw text for tags whose content is not shown as text (`[img]url[/img]`, headings).
enum Capture {
    None,
    Image(String),
    Heading(String),
    /// Content dropped until the closing tag (embedded videos, scripts).
    Skip(String),
}

struct Builder {
    blocks: Vec<NewsBlock>,
    spans: Vec<Span>,
    kind: BlockKind,
    bold: u32,
    italic: u32,
    /// Open links: the target and the span index where the link text starts.
    links: Vec<(Option<String>, usize)>,
    capture: Capture,
}

impl Builder {
    fn new() -> Self {
        Self {
            blocks: Vec::new(),
            spans: Vec::new(),
            kind: BlockKind::Paragraph,
            bold: 0,
            italic: 0,
            links: Vec::new(),
            capture: Capture::None,
        }
    }

    fn href(&self) -> Option<String> {
        self.links.iter().rev().find_map(|(href, _)| href.clone())
    }

    fn push_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        let (bold, italic, href) = (self.bold > 0, self.italic > 0, self.href());
        // Never merge into text before a link start: `[url]…[/url]` links its own text.
        let link_starts_here = self
            .links
            .iter()
            .any(|(_, start)| *start == self.spans.len());
        if let Some(last) = self.spans.last_mut()
            && !link_starts_here
            && last.bold == bold
            && last.italic == italic
            && last.href == href
        {
            last.text.push_str(text);
            return;
        }
        self.spans.push(Span {
            text: text.to_owned(),
            href,
            bold,
            italic,
        });
    }

    /// Text with blank lines starting new paragraphs.
    fn text(&mut self, text: &str) {
        let text = decode_entities(&text.replace("\r\n", "\n"));
        let mut parts = text.split("\n\n").peekable();
        while let Some(part) = parts.next() {
            self.push_text(part);
            if parts.peek().is_some() {
                self.flush();
            }
        }
    }

    fn flush(&mut self) {
        let mut spans = std::mem::take(&mut self.spans);
        // Trim the whitespace around the block, keep line breaks inside it.
        if let Some(first) = spans.first_mut() {
            first.text = first.text.trim_start().to_owned();
        }
        if let Some(last) = spans.last_mut() {
            last.text = last.text.trim_end().to_owned();
        }
        spans.retain(|span| !span.text.is_empty());
        // A link opened before the flush continues in the next block.
        for link in &mut self.links {
            link.1 = 0;
        }
        if spans.is_empty() {
            return;
        }
        self.blocks.push(match self.kind {
            BlockKind::Paragraph => NewsBlock::Paragraph { spans },
            BlockKind::ListItem => NewsBlock::ListItem { spans },
        });
    }

    fn image(&mut self, raw: &str) {
        if let Some(src) = resolve_url(raw) {
            self.flush();
            self.blocks.push(NewsBlock::Image { src });
        }
    }

    fn tag(&mut self, name: &str, closing: bool, value: Option<String>) {
        match (name, closing) {
            ("b" | "strong", false) => self.bold += 1,
            ("b" | "strong", true) => self.bold = self.bold.saturating_sub(1),
            ("i" | "em", false) => self.italic += 1,
            ("i" | "em", true) => self.italic = self.italic.saturating_sub(1),
            ("url" | "a", false) => {
                let href = value.as_deref().and_then(resolve_url);
                self.links.push((href, self.spans.len()));
            }
            ("url" | "a", true) => self.close_link(),
            ("img", false) => match value {
                // HTML `<img src>`, or BBCode `[img=url]`.
                Some(src) => self.image(&src),
                None => self.capture = Capture::Image(String::new()),
            },
            ("h1" | "h2" | "h3" | "h4" | "h5" | "h6", false) => {
                self.flush();
                self.capture = Capture::Heading(String::new());
            }
            ("list" | "olist" | "ul" | "ol", _) => {
                self.flush();
                self.kind = BlockKind::Paragraph;
            }
            ("*" | "li", false) => {
                self.flush();
                self.kind = BlockKind::ListItem;
            }
            ("li", true) => {
                self.flush();
                self.kind = BlockKind::Paragraph;
            }
            ("br", _) => self.push_text("\n"),
            ("p" | "div" | "quote" | "code" | "blockquote" | "table" | "tr" | "td" | "th", _)
            | ("hr", false) => self.flush(),
            ("previewyoutube" | "video" | "script" | "style" | "noparse", false) => {
                self.capture = Capture::Skip(name.to_owned());
            }
            _ => {}
        }
    }

    /// `[url]https://…[/url]`: the text is the target.
    fn close_link(&mut self) {
        let Some((href, start)) = self.links.pop() else {
            return;
        };
        if href.is_some() {
            return;
        }
        let start = start.min(self.spans.len());
        let text: String = self.spans[start..]
            .iter()
            .map(|span| span.text.as_str())
            .collect();
        if let Some(target) = resolve_url(&text) {
            for span in &mut self.spans[start..] {
                span.href = Some(target.clone());
            }
        }
    }

    /// Feeds a token while a capture is open; the matching closing tag ends it.
    fn feed_capture(&mut self, token: &Token<'_>) {
        let capture = std::mem::replace(&mut self.capture, Capture::None);
        self.capture = match (capture, token) {
            (
                Capture::Image(url),
                Token::Tag {
                    name,
                    closing: true,
                    ..
                },
            ) if name == "img" => {
                self.image(&url);
                Capture::None
            }
            (Capture::Image(mut url), Token::Text(text)) => {
                url.push_str(text);
                Capture::Image(url)
            }
            (
                Capture::Heading(text),
                Token::Tag {
                    name,
                    closing: true,
                    ..
                },
            ) if name.starts_with('h') && name.len() == 2 => {
                let text = decode_entities(text.trim());
                if !text.is_empty() {
                    self.blocks.push(NewsBlock::Heading { text });
                }
                Capture::None
            }
            (Capture::Heading(mut heading), Token::Text(text)) => {
                heading.push_str(text);
                Capture::Heading(heading)
            }
            (
                Capture::Skip(open),
                Token::Tag {
                    name,
                    closing: true,
                    ..
                },
            ) if *name == open => Capture::None,
            (capture, _) => capture,
        };
    }

    fn finish(mut self) -> Vec<NewsBlock> {
        self.flush();
        self.blocks
    }
}

/// Parses a news post into blocks.
pub fn parse(contents: &str) -> Vec<NewsBlock> {
    let mut builder = Builder::new();
    for token in tokenize(contents) {
        if !matches!(builder.capture, Capture::None) {
            builder.feed_capture(&token);
            continue;
        }
        match token {
            Token::Text(text) => builder.text(text),
            Token::Tag {
                name,
                closing,
                value,
            } => builder.tag(&name, closing, value),
        }
    }
    builder.finish()
}

/// Plain text of the first paragraphs, cut at a word boundary near `max_chars`.
pub fn excerpt(blocks: &[NewsBlock], max_chars: usize) -> String {
    let mut text = String::new();
    for block in blocks {
        let spans = match block {
            NewsBlock::Paragraph { spans } | NewsBlock::ListItem { spans } => spans,
            NewsBlock::Heading { .. } | NewsBlock::Image { .. } => continue,
        };
        for span in spans {
            text.push_str(&span.text);
        }
        text.push(' ');
        if text.chars().count() > max_chars {
            break;
        }
    }
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= max_chars {
        return collapsed;
    }
    let cut: String = collapsed.chars().take(max_chars).collect();
    let cut = match cut.rfind(' ') {
        Some(space) if space > max_chars / 2 => &cut[..space],
        _ => cut.as_str(),
    };
    format!(
        "{}…",
        cut.trim_end_matches(|c: char| c.is_ascii_punctuation())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(text: &str) -> Span {
        Span {
            text: text.into(),
            ..Span::default()
        }
    }

    fn link(text: &str, href: &str) -> Span {
        Span {
            text: text.into(),
            href: Some(href.into()),
            ..Span::default()
        }
    }

    #[test]
    fn parses_a_bbcode_announcement() {
        let blocks = parse(
            "[img]{STEAM_CLAN_IMAGE}/28424520/913f.png[/img]\n\nHey there climbers!\n\n\
             For [url=https://fanga.me/r/na]North America click here[/url], or [b]Europe[/b].",
        );
        assert_eq!(
            blocks,
            vec![
                NewsBlock::Image {
                    src: "https://clan.akamai.steamstatic.com/images/28424520/913f.png".into()
                },
                NewsBlock::Paragraph {
                    spans: vec![text("Hey there climbers!")]
                },
                NewsBlock::Paragraph {
                    spans: vec![
                        text("For "),
                        link("North America click here", "https://fanga.me/r/na"),
                        text(", or "),
                        Span {
                            text: "Europe".into(),
                            bold: true,
                            ..Span::default()
                        },
                        text("."),
                    ]
                },
            ]
        );
    }

    #[test]
    fn parses_headings_and_lists() {
        let blocks = parse(
            "[h2]New Options:[/h2]\n[list]\n[*] Added a setting\n[*] Added a mode\n[/list]\nThanks",
        );
        assert_eq!(
            blocks,
            vec![
                NewsBlock::Heading {
                    text: "New Options:".into()
                },
                NewsBlock::ListItem {
                    spans: vec![text("Added a setting")]
                },
                NewsBlock::ListItem {
                    spans: vec![text("Added a mode")]
                },
                NewsBlock::Paragraph {
                    spans: vec![text("Thanks")]
                },
            ]
        );
    }

    #[test]
    fn parses_html_and_drops_what_it_cannot_show() {
        let blocks = parse(
            r#"<img src="https://cdn.example.com/a.jpg"/><br><br>Read <a href="https://www.pcgamer.com/x" target="_blank">more</a> &amp; enjoy<script>alert(1)</script><a href="javascript:alert(1)">bad</a>"#,
        );
        assert_eq!(
            blocks,
            vec![
                NewsBlock::Image {
                    src: "https://cdn.example.com/a.jpg".into()
                },
                NewsBlock::Paragraph {
                    spans: vec![
                        text("Read "),
                        link("more", "https://www.pcgamer.com/x"),
                        text(" & enjoy"),
                        // The rejected link keeps its text, unlinked.
                        text("bad"),
                    ]
                },
            ]
        );
    }

    #[test]
    fn a_bare_url_tag_links_to_its_text() {
        let blocks = parse("See [url]https://celestegame.com[/url]");
        assert_eq!(
            blocks,
            vec![NewsBlock::Paragraph {
                spans: vec![
                    text("See "),
                    link("https://celestegame.com", "https://celestegame.com")
                ]
            }]
        );
    }

    #[test]
    fn brackets_that_are_not_tags_stay_text() {
        let blocks = parse("Patch [1.4] is out < tomorrow");
        assert_eq!(
            blocks,
            vec![NewsBlock::Paragraph {
                spans: vec![text("Patch [1.4] is out < tomorrow")]
            }]
        );
    }

    #[test]
    fn skips_embedded_videos() {
        let blocks = parse("Watch:[previewyoutube=abc;full][/previewyoutube] now");
        assert_eq!(
            blocks,
            vec![NewsBlock::Paragraph {
                spans: vec![text("Watch: now")]
            }]
        );
    }

    #[test]
    fn excerpts_cut_at_a_word() {
        let blocks =
            parse("[h1]Title[/h1]Hey there climbers! We just wanted to give you a heads up.");
        assert_eq!(
            excerpt(&blocks, 100),
            "Hey there climbers! We just wanted to give you a heads up."
        );
        assert_eq!(excerpt(&blocks, 30), "Hey there climbers! We just…");
    }

    #[test]
    fn decodes_entities() {
        assert_eq!(
            decode_entities("a &amp; b &#39;c&#x27; &bogus; &"),
            "a & b 'c' &bogus; &"
        );
    }
}

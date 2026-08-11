#include "core/Json.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>

namespace aj::json {

// ---------------------------------------------------------------- פרוש ----
namespace {

class Parser {
public:
    explicit Parser(const std::string& s) : m_s(s) {}

    Value parse() {
        skipWs();
        Value v = parseValue();
        skipWs();
        return v;
    }

private:
    const std::string& m_s;
    size_t m_i = 0;

    void skipWs() {
        while (m_i < m_s.size() && (m_s[m_i] == ' ' || m_s[m_i] == '\t' ||
                                    m_s[m_i] == '\n' || m_s[m_i] == '\r'))
            ++m_i;
    }
    bool eat(char c) {
        if (m_i < m_s.size() && m_s[m_i] == c) { ++m_i; return true; }
        return false;
    }
    bool peek(char c) const { return m_i < m_s.size() && m_s[m_i] == c; }

    Value parseValue() {
        if (m_i >= m_s.size()) return Value();
        char c = m_s[m_i];
        switch (c) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"': return Value(parseString());
            case 't': return parseLiteral("true", Value(true));
            case 'f': return parseLiteral("false", Value(false));
            case 'n': return parseLiteral("null", Value());
            default:  return parseNumber();
        }
    }

    Value parseLiteral(const char* lit, Value v) {
        size_t n = std::strlen(lit);
        if (m_s.compare(m_i, n, lit) == 0) { m_i += n; return v; }
        return Value(); // שגיאה → null
    }

    Value parseObject() {
        Value obj;
        ++m_i; // {
        skipWs();
        if (eat('}')) return obj;
        while (true) {
            skipWs();
            if (!peek('"')) break;
            std::string key = parseString();
            skipWs();
            if (!eat(':')) break;
            skipWs();
            obj[key] = parseValue();
            skipWs();
            if (eat('}')) break;
            if (!eat(',')) break;
        }
        return obj;
    }

    Value parseArray() {
        Value arr;
        ++m_i; // [
        skipWs();
        if (eat(']')) return arr;
        while (true) {
            skipWs();
            arr.push(parseValue());
            skipWs();
            if (eat(']')) break;
            if (!eat(',')) break;
        }
        return arr;
    }

    std::string parseString() {
        std::string out;
        if (!eat('"')) return out;
        while (m_i < m_s.size()) {
            unsigned char c = static_cast<unsigned char>(m_s[m_i]);
            if (c == '"') { ++m_i; break; }
            if (c == '\\' && m_i + 1 < m_s.size()) {
                char n = m_s[m_i + 1];
                switch (n) {
                    case '"':  out += '"';  m_i += 2; break;
                    case '\\': out += '\\'; m_i += 2; break;
                    case '/':  out += '/';  m_i += 2; break;
                    case 'b':  out += '\b'; m_i += 2; break;
                    case 'f':  out += '\f'; m_i += 2; break;
                    case 'n':  out += '\n'; m_i += 2; break;
                    case 'r':  out += '\r'; m_i += 2; break;
                    case 't':  out += '\t'; m_i += 2; break;
                    case 'u': {
                        // קידוד UTF-16 → UTF-8 (מספיק לרוב המקרים)
                        if (m_i + 6 <= m_s.size()) {
                            unsigned cp = static_cast<unsigned>(std::strtoul(m_s.substr(m_i + 2, 4).c_str(), nullptr, 16));
                            m_i += 6;
                            if (cp >= 0xD800 && cp <= 0xDBFF && m_i + 6 <= m_s.size() &&
                                m_s[m_i] == '\\' && m_s[m_i + 1] == 'u') {
                                unsigned lo = static_cast<unsigned>(std::strtoul(m_s.substr(m_i + 2, 4).c_str(), nullptr, 16));
                                if (lo >= 0xDC00 && lo <= 0xDFFF) {
                                    cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                                    m_i += 6;
                                }
                            }
                            if (cp < 0x80) {
                                out += static_cast<char>(cp);
                            } else if (cp < 0x800) {
                                out += static_cast<char>(0xC0 | (cp >> 6));
                                out += static_cast<char>(0x80 | (cp & 0x3F));
                            } else if (cp < 0x10000) {
                                out += static_cast<char>(0xE0 | (cp >> 12));
                                out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                                out += static_cast<char>(0x80 | (cp & 0x3F));
                            } else {
                                out += static_cast<char>(0xF0 | (cp >> 18));
                                out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
                                out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                                out += static_cast<char>(0x80 | (cp & 0x3F));
                            }
                        } else {
                            m_i += 2;
                        }
                        break;
                    }
                    default: out += n; m_i += 2; break;
                }
            } else {
                out += m_s[m_i++];
            }
        }
        return out;
    }

    Value parseNumber() {
        size_t start = m_i;
        if (m_i < m_s.size() && (m_s[m_i] == '-' || m_s[m_i] == '+')) ++m_i;
        while (m_i < m_s.size() && (std::isdigit(static_cast<unsigned char>(m_s[m_i])) || m_s[m_i] == '.' ||
                                    m_s[m_i] == 'e' || m_s[m_i] == 'E' || m_s[m_i] == '-' || m_s[m_i] == '+'))
            ++m_i;
        if (m_i == start) { ++m_i; return Value(); }
        return Value(std::strtod(m_s.substr(start, m_i - start).c_str(), nullptr));
    }
};

std::string escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (size_t i = 0; i < s.size(); ++i) {
        unsigned char c = static_cast<unsigned char>(s[i]);
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

} // namespace

// ---------------------------------------------------------------- סידור ----
std::string Value::dump(bool pretty, int indent) const {
    std::string pad;
    if (pretty) pad.assign(static_cast<size_t>(indent) * 2, ' ');

    switch (m_type) {
        case Type::Null:   return "null";
        case Type::Bool:   return m_bool ? "true" : "false";
        case Type::Number: {
            if (m_num == static_cast<int64_t>(m_num) && std::fabs(m_num) < 1e15) {
                char buf[32];
                std::snprintf(buf, sizeof(buf), "%lld", static_cast<long long>(m_num));
                return buf;
            }
            char buf[32];
            std::snprintf(buf, sizeof(buf), "%.17g", m_num);
            return buf;
        }
        case Type::String: return "\"" + escape(m_str) + "\"";
        case Type::Array: {
            if (m_arr.empty()) return "[]";
            std::string out = "[";
            for (size_t i = 0; i < m_arr.size(); ++i) {
                if (i) out += ",";
                if (pretty) out += "\n" + pad + "  ";
                out += m_arr[i].dump(pretty, indent + 1);
            }
            if (pretty) out += "\n" + pad;
            out += "]";
            return out;
        }
        case Type::Object: {
            if (m_obj.empty()) return "{}";
            std::string out = "{";
            size_t i = 0;
            for (const auto& [k, v] : m_obj) {
                if (i++) out += ",";
                if (pretty) out += "\n" + pad + "  ";
                out += "\"" + escape(k) + "\":" + (pretty ? " " : "") + v.dump(pretty, indent + 1);
            }
            if (pretty) out += "\n" + pad;
            out += "}";
            return out;
        }
    }
    return "null";
}

// --------------------------------------------------------------- פונקציות ---
Value parse(const std::string& text) {
    Parser p(text);
    return p.parse();
}

Value parseFile(const std::string& path, std::string* errMsg) {
    std::FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) {
        if (errMsg) *errMsg = "cannot open file: " + path;
        return Value();
    }
    std::string text;
    char buf[8192];
    size_t n;
    while ((n = std::fread(buf, 1, sizeof(buf), f)) > 0) text.append(buf, n);
    std::fclose(f);
    return parse(text);
}

bool writeFile(const std::string& path, const Value& v, bool pretty) {
    std::FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    std::string out = v.dump(pretty);
    bool ok = std::fwrite(out.data(), 1, out.size(), f) == out.size();
    std::fclose(f);
    return ok;
}

} // namespace aj::json

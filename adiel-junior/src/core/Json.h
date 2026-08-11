// =============================================================================
//  Adiel Junior — json (פרוש/כתיבת JSON עצמאי, ללא תלות חיצונית)
//  מימוש מינימלי אבל מלא: null / bool / number / string / array / object.
// =============================================================================
#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace aj::json {

enum class Type { Null, Bool, Number, String, Array, Object };

class Value {
public:
    Value() : m_type(Type::Null) {}
    explicit Value(bool b)        : m_type(Type::Bool),   m_bool(b) {}
    explicit Value(double d)      : m_type(Type::Number), m_num(d) {}
    explicit Value(int i)         : m_type(Type::Number), m_num(static_cast<double>(i)) {}
    explicit Value(int64_t i)     : m_type(Type::Number), m_num(static_cast<double>(i)) {}
    explicit Value(const char* s) : m_type(Type::String), m_str(s) {}
    explicit Value(std::string s) : m_type(Type::String), m_str(std::move(s)) {}

    // ממירים
    Type type() const { return m_type; }
    bool isNull()   const { return m_type == Type::Null; }
    bool isBool()   const { return m_type == Type::Bool; }
    bool isNumber() const { return m_type == Type::Number; }
    bool isString() const { return m_type == Type::String; }
    bool isArray()  const { return m_type == Type::Array; }
    bool isObject() const { return m_type == Type::Object; }

    bool asBool(bool def = false) const { return m_type == Type::Bool ? m_bool : def; }
    double asNumber(double def = 0.0) const { return m_type == Type::Number ? m_num : def; }
    int64_t asInt(int64_t def = 0) const { return m_type == Type::Number ? static_cast<int64_t>(m_num) : def; }
    const std::string& asString() const { return m_str; }
    std::string asString(const std::string& def) const { return m_type == Type::String ? m_str : def; }

    // מערכים / אובייקטים
    std::vector<Value>& array() { return m_arr; }
    const std::vector<Value>& array() const { return m_arr; }
    std::map<std::string, Value, std::less<>>& object() { return m_obj; }
    const std::map<std::string, Value, std::less<>>& object() const { return m_obj; }

    Value& operator[](const std::string& key) {
        if (m_type != Type::Object) { m_type = Type::Object; m_obj.clear(); }
        return m_obj[key];
    }
    Value& operator[](size_t idx) {
        if (m_type != Type::Array) { m_type = Type::Array; m_arr.clear(); }
        if (idx >= m_arr.size()) m_arr.resize(idx + 1);
        return m_arr[idx];
    }

    // חיפוש עם ברירת מחדל (לא יוצר מפתחות)
    const Value* find(const std::string& key) const {
        if (m_type != Type::Object) return nullptr;
        auto it = m_obj.find(key);
        return it == m_obj.end() ? nullptr : &it->second;
    }
    std::string getString(const std::string& key, const std::string& def = "") const {
        const Value* v = find(key);
        return (v && v->isString()) ? v->m_str : def;
    }
    double getNumber(const std::string& key, double def = 0.0) const {
        const Value* v = find(key);
        return (v && v->isNumber()) ? v->m_num : def;
    }
    int64_t getInt(const std::string& key, int64_t def = 0) const {
        const Value* v = find(key);
        return (v && v->isNumber()) ? static_cast<int64_t>(v->m_num) : def;
    }
    bool getBool(const std::string& key, bool def = false) const {
        const Value* v = find(key);
        return (v && v->isBool()) ? v->m_bool : def;
    }
    const Value* getObject(const std::string& key) const {
        const Value* v = find(key);
        return (v && v->isObject()) ? v : nullptr;
    }
    const Value* getArray(const std::string& key) const {
        const Value* v = find(key);
        return (v && v->isArray()) ? v : nullptr;
    }

    void push(Value v) { if (m_type != Type::Array) { m_type = Type::Array; m_arr.clear(); } m_arr.push_back(std::move(v)); }
    void set(const std::string& key, Value v) { (*this)[key] = std::move(v); }

    // סידור (stringify)
    std::string dump(bool pretty = false, int indent = 0) const;

private:
    Type m_type;
    bool m_bool = false;
    double m_num = 0.0;
    std::string m_str;
    std::vector<Value> m_arr;
    std::map<std::string, Value, std::less<>> m_obj;
};

// פרוש מחרוזת JSON → Value. מחזיר null על שגיאה (בדקו עם isNull()).
Value parse(const std::string& text);
// פרוש מקובץ → Value.
Value parseFile(const std::string& path, std::string* errMsg = nullptr);
// כתיבה לקובץ.
bool writeFile(const std::string& path, const Value& v, bool pretty = true);

} // namespace aj::json

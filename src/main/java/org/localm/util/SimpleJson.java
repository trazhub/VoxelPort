package org.localm.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SimpleJson {
    private SimpleJson() {}

    public static Object parse(String json) {
        return new Parser(json).parse();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> asObject(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> asArray(Object value) {
        return value instanceof List<?> ? (List<Object>) value : List.of();
    }

    public static String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public static long asLong(Object value, long fallback) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String s) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }

    public static boolean asBoolean(Object value, boolean fallback) {
        return value instanceof Boolean b ? b : fallback;
    }

    private static final class Parser {
        private final String input;
        private int pos;

        private Parser(String input) {
            this.input = input == null ? "" : input;
        }

        private Object parse() {
            Object value = readValue();
            skipWhitespace();
            if (pos != input.length()) {
                throw error("Unexpected trailing content");
            }
            return value;
        }

        private Object readValue() {
            skipWhitespace();
            if (pos >= input.length()) throw error("Unexpected end of JSON");
            char c = input.charAt(pos);
            return switch (c) {
                case '{' -> readObject();
                case '[' -> readArray();
                case '"' -> readString();
                case 't' -> readLiteral("true", Boolean.TRUE);
                case 'f' -> readLiteral("false", Boolean.FALSE);
                case 'n' -> readLiteral("null", null);
                default -> {
                    if (c == '-' || Character.isDigit(c)) yield readNumber();
                    throw error("Unexpected character");
                }
            };
        }

        private Map<String, Object> readObject() {
            expect('{');
            Map<String, Object> out = new LinkedHashMap<>();
            skipWhitespace();
            if (peek('}')) {
                pos++;
                return out;
            }
            while (true) {
                String key = readString();
                skipWhitespace();
                expect(':');
                out.put(key, readValue());
                skipWhitespace();
                if (peek('}')) {
                    pos++;
                    return out;
                }
                expect(',');
                skipWhitespace();
            }
        }

        private List<Object> readArray() {
            expect('[');
            List<Object> out = new ArrayList<>();
            skipWhitespace();
            if (peek(']')) {
                pos++;
                return out;
            }
            while (true) {
                out.add(readValue());
                skipWhitespace();
                if (peek(']')) {
                    pos++;
                    return out;
                }
                expect(',');
            }
        }

        private String readString() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (pos < input.length()) {
                char c = input.charAt(pos++);
                if (c == '"') return out.toString();
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (pos >= input.length()) throw error("Unterminated escape");
                char esc = input.charAt(pos++);
                switch (esc) {
                    case '"' -> out.append('"');
                    case '\\' -> out.append('\\');
                    case '/' -> out.append('/');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> {
                        if (pos + 4 > input.length()) throw error("Invalid unicode escape");
                        String hex = input.substring(pos, pos + 4);
                        out.append((char) Integer.parseInt(hex, 16));
                        pos += 4;
                    }
                    default -> throw error("Invalid escape");
                }
            }
            throw error("Unterminated string");
        }

        private Object readNumber() {
            int start = pos;
            if (peek('-')) pos++;
            while (pos < input.length() && Character.isDigit(input.charAt(pos))) pos++;
            boolean floating = false;
            if (peek('.')) {
                floating = true;
                pos++;
                while (pos < input.length() && Character.isDigit(input.charAt(pos))) pos++;
            }
            if (pos < input.length() && (input.charAt(pos) == 'e' || input.charAt(pos) == 'E')) {
                floating = true;
                pos++;
                if (pos < input.length() && (input.charAt(pos) == '+' || input.charAt(pos) == '-')) pos++;
                while (pos < input.length() && Character.isDigit(input.charAt(pos))) pos++;
            }
            String value = input.substring(start, pos);
            return floating ? Double.parseDouble(value) : Long.parseLong(value);
        }

        private Object readLiteral(String literal, Object value) {
            if (!input.startsWith(literal, pos)) throw error("Invalid literal");
            pos += literal.length();
            return value;
        }

        private void expect(char expected) {
            if (pos >= input.length() || input.charAt(pos) != expected) {
                throw error("Expected '" + expected + "'");
            }
            pos++;
        }

        private boolean peek(char expected) {
            return pos < input.length() && input.charAt(pos) == expected;
        }

        private void skipWhitespace() {
            while (pos < input.length() && Character.isWhitespace(input.charAt(pos))) pos++;
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at JSON offset " + pos);
        }
    }
}

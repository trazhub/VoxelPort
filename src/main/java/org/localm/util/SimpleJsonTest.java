package org.localm.util;

import java.util.List;
import java.util.Map;

public class SimpleJsonTest {
    public static void main(String[] args) {
        testParseObject();
        testParseArray();
        testNested();
        System.out.println("All SimpleJson tests passed!");
    }

    private static void testParseObject() {
        String json = "{\"key\": \"value\", \"num\": 123}";
        Map<String, Object> map = (Map<String, Object>) SimpleJson.parse(json);
        assert "value".equals(map.get("key"));
        assert Double.valueOf(123).equals(map.get("num"));
    }

    private static void testParseArray() {
        String json = "[\"one\", \"two\", 3]";
        List<Object> list = (List<Object>) SimpleJson.parse(json);
        assert list.size() == 3;
        assert "one".equals(list.get(0));
        assert Double.valueOf(3).equals(list.get(2));
    }

    private static void testNested() {
        String json = "{\"arr\": [1, {\"inner\": true}]}";
        Map<String, Object> map = (Map<String, Object>) SimpleJson.parse(json);
        List<Object> arr = (List<Object>) map.get("arr");
        Map<String, Object> inner = (Map<String, Object>) arr.get(1);
        assert Boolean.TRUE.equals(inner.get("inner"));
    }
}

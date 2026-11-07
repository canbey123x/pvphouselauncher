package net.kdt.pojavlaunch.pvphouse;

import java.io.DataInput;
import java.io.DataInputStream;
import java.io.DataOutput;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal, lossless reader/writer for uncompressed big-endian NBT (the format of servers.dat).
 *
 * Mapping (Java type <-> tag): Byte=1, Short=2, Integer=3, Long=4, Float=5, Double=6,
 * byte[]=7, String=8, {@link TagList}=9, {@link LinkedHashMap}&lt;String,Object&gt;=10, int[]=11, long[]=12.
 * Lists keep their element type, so an empty list round-trips unchanged; compounds keep key order.
 */
public final class Nbt {
    public static final byte END = 0, BYTE = 1, SHORT = 2, INT = 3, LONG = 4, FLOAT = 5, DOUBLE = 6,
            BYTE_ARRAY = 7, STRING = 8, LIST = 9, COMPOUND = 10, INT_ARRAY = 11, LONG_ARRAY = 12;

    private static final int MAX_DEPTH = 512;

    private Nbt() {}

    /** A list tag together with its element type. */
    public static final class TagList {
        public byte elementType;
        public final List<Object> items;

        public TagList(byte elementType) {
            this(elementType, new ArrayList<>());
        }

        public TagList(byte elementType, List<Object> items) {
            this.elementType = elementType;
            this.items = items;
        }
    }

    /** Named root compound. */
    public static final class Root {
        public String name;
        public LinkedHashMap<String, Object> compound;

        public Root(String name, LinkedHashMap<String, Object> compound) {
            this.name = name;
            this.compound = compound;
        }
    }

    // ------------------------------------------------------------------ read

    public static Root read(InputStream in) throws IOException {
        DataInputStream data = new DataInputStream(in);
        byte type = data.readByte();
        if (type != COMPOUND) throw new IOException("NBT root is not a compound (type " + type + ")");
        String name = data.readUTF();
        @SuppressWarnings("unchecked")
        LinkedHashMap<String, Object> compound = (LinkedHashMap<String, Object>) readPayload(data, COMPOUND, 0);
        return new Root(name, compound);
    }

    private static Object readPayload(DataInput in, byte type, int depth) throws IOException {
        if (depth > MAX_DEPTH) throw new IOException("NBT nested too deeply");
        switch (type) {
            case BYTE: return in.readByte();
            case SHORT: return in.readShort();
            case INT: return in.readInt();
            case LONG: return in.readLong();
            case FLOAT: return in.readFloat();
            case DOUBLE: return in.readDouble();
            case BYTE_ARRAY: {
                byte[] value = new byte[checkLength(in.readInt())];
                in.readFully(value);
                return value;
            }
            case STRING: return in.readUTF();
            case LIST: {
                byte elementType = in.readByte();
                int length = in.readInt();
                if (length <= 0) return new TagList(elementType);
                checkLength(length);
                TagList list = new TagList(elementType, new ArrayList<>(Math.min(length, 1024)));
                for (int i = 0; i < length; i++) list.items.add(readPayload(in, elementType, depth + 1));
                return list;
            }
            case COMPOUND: {
                LinkedHashMap<String, Object> compound = new LinkedHashMap<>();
                while (true) {
                    byte childType = in.readByte();
                    if (childType == END) break;
                    String key = in.readUTF();
                    compound.put(key, readPayload(in, childType, depth + 1));
                }
                return compound;
            }
            case INT_ARRAY: {
                int[] value = new int[checkLength(in.readInt())];
                for (int i = 0; i < value.length; i++) value[i] = in.readInt();
                return value;
            }
            case LONG_ARRAY: {
                long[] value = new long[checkLength(in.readInt())];
                for (int i = 0; i < value.length; i++) value[i] = in.readLong();
                return value;
            }
            default:
                throw new IOException("Unknown NBT tag type " + type);
        }
    }

    private static int checkLength(int length) throws IOException {
        if (length < 0 || length > 16 * 1024 * 1024) throw new IOException("Invalid NBT length " + length);
        return length;
    }

    // ----------------------------------------------------------------- write

    public static void write(Root root, OutputStream out) throws IOException {
        DataOutputStream data = new DataOutputStream(out);
        data.writeByte(COMPOUND);
        data.writeUTF(root.name == null ? "" : root.name);
        writePayload(data, root.compound);
        data.flush();
    }

    @SuppressWarnings("unchecked")
    private static void writePayload(DataOutput out, Object value) throws IOException {
        if (value instanceof Byte) out.writeByte((Byte) value);
        else if (value instanceof Short) out.writeShort((Short) value);
        else if (value instanceof Integer) out.writeInt((Integer) value);
        else if (value instanceof Long) out.writeLong((Long) value);
        else if (value instanceof Float) out.writeFloat((Float) value);
        else if (value instanceof Double) out.writeDouble((Double) value);
        else if (value instanceof byte[]) {
            byte[] array = (byte[]) value;
            out.writeInt(array.length);
            out.write(array);
        } else if (value instanceof String) out.writeUTF((String) value);
        else if (value instanceof TagList) {
            TagList list = (TagList) value;
            byte elementType = list.items.isEmpty() ? list.elementType : typeOf(list.items.get(0));
            out.writeByte(elementType);
            out.writeInt(list.items.size());
            for (Object item : list.items) {
                if (typeOf(item) != elementType) throw new IOException("Mixed types in NBT list");
                writePayload(out, item);
            }
        } else if (value instanceof Map) {
            for (Map.Entry<String, Object> entry : ((Map<String, Object>) value).entrySet()) {
                out.writeByte(typeOf(entry.getValue()));
                out.writeUTF(entry.getKey());
                writePayload(out, entry.getValue());
            }
            out.writeByte(END);
        } else if (value instanceof int[]) {
            int[] array = (int[]) value;
            out.writeInt(array.length);
            for (int i : array) out.writeInt(i);
        } else if (value instanceof long[]) {
            long[] array = (long[]) value;
            out.writeInt(array.length);
            for (long l : array) out.writeLong(l);
        } else {
            throw new IOException("Unsupported NBT value " + (value == null ? "null" : value.getClass()));
        }
    }

    public static byte typeOf(Object value) throws IOException {
        if (value instanceof Byte) return BYTE;
        if (value instanceof Short) return SHORT;
        if (value instanceof Integer) return INT;
        if (value instanceof Long) return LONG;
        if (value instanceof Float) return FLOAT;
        if (value instanceof Double) return DOUBLE;
        if (value instanceof byte[]) return BYTE_ARRAY;
        if (value instanceof String) return STRING;
        if (value instanceof TagList) return LIST;
        if (value instanceof Map) return COMPOUND;
        if (value instanceof int[]) return INT_ARRAY;
        if (value instanceof long[]) return LONG_ARRAY;
        throw new IOException("Unsupported NBT value " + (value == null ? "null" : value.getClass()));
    }
}

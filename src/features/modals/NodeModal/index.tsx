import React, { useEffect, useMemo, useState } from "react"; // new change 1
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput } from "@mantine/core"; // new change 2
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useJson from "../../../store/useJson"; 
import useFile from "../../../store/useFile"; 
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, unknown> = {}; // new change 5
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// ------- helpers for safe JSON updates (preserve arrays/objects) -------
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // new change 6

const getAtPath = (obj: any, path: NodeData["path"] | undefined) => { // new change 7
  if (!path || path.length === 0) return obj;
  let cur = obj;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
};

// lookahead to create arrays when the *next* segment is a number
const setAtPath = (root: any, path: NodeData["path"] | undefined, newValue: any) => { // new change 8
  const clone = deepClone(root ?? {});
  if (!path || path.length === 0) return newValue;

  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const nextSeg = path[i + 1];

    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        // parent should already be an array; if not, make best effort
      }
      if (cur[seg] === undefined) cur[seg] = typeof nextSeg === "number" ? [] : {};
      cur = cur[seg];
    } else {
      if (cur[seg] === undefined) cur[seg] = typeof nextSeg === "number" ? [] : {};
      else if (typeof nextSeg === "number" && !Array.isArray(cur[seg])) cur[seg] = [];
      cur = cur[seg];
    }
  }

  const last = path[path.length - 1];
  if (typeof last === "number") cur[last] = newValue;
  else cur[last] = newValue;

  return clone;
};

// parse string back into the correct primitive
const parseValue = (row: any, input: string) => { // new change 9
  if (row.type === "number") {
    const n = Number(input);
    return Number.isFinite(n) ? n : input;
  }
  if (row.type === "boolean") {
    const lower = String(input).toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return input;
  }
  if (row.type === "null") return null;
  return input;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJson = useJson(state => state.setJson); // new change 10
  const setContents = useFile(state => state.setContents); // new change 11

  const [isEditMode, setIsEditMode] = useState(false); // new change 12
  const [saving, setSaving] = useState(false); // new change 13
  const [editedFields, setEditedFields] = useState<Record<string, string>>({}); // new change 14

  // prefill editable primitive fields
  const primeEditedFields = () => { // new change 15
    const initial: Record<string, string> = {};
    if (nodeData?.text && nodeData.text.length > 0) {
      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        initial["__value"] = String(nodeData.text[0].value ?? "");
      } else {
        nodeData.text.forEach(row => {
          if (row.key && row.type !== "object" && row.type !== "array") {
            initial[row.key] = String(row.value ?? "");
          }
        });
      }
    }
    setEditedFields(initial);
  };

  useEffect(() => { // new change 16
    setIsEditMode(false);
    setEditedFields({});
  }, [nodeData, opened]);

  const previewContent = useMemo( // new change 17
    () => normalizeNodeData(nodeData?.text ?? []),
    [nodeData?.text]
  );

  const handleEdit = () => { // new change 18
    primeEditedFields();
    setIsEditMode(true);
  };

  const handleCancel = () => { // new change 19
    setIsEditMode(false);
    setEditedFields({});
  };

  const handleSave = async () => { // new change 20
    if (!nodeData) return;
    setSaving(true);
    try {
      const jsonStr = useJson.getState().json;
      const jsonObj = jsonStr ? JSON.parse(jsonStr) : {};

      const currentAtPath = getAtPath(jsonObj, nodeData.path);
      let newValue: any;

      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        const original = nodeData.text[0];
        const input = editedFields["__value"] ?? String(original.value ?? "");
        newValue = parseValue(original, input);
      } else {
        const base =
          currentAtPath && typeof currentAtPath === "object" && !Array.isArray(currentAtPath)
            ? currentAtPath
            : {};
        const merged = deepClone(base);
        nodeData.text
          .filter(r => r.key && r.type !== "object" && r.type !== "array")
          .forEach(row => {
            const input = editedFields[row.key!] ?? String(row.value ?? "");
            merged[row.key!] = parseValue(row, input);
          });
        newValue = merged;
      }

      const updated = setAtPath(jsonObj, nodeData.path, newValue);
      const updatedStr = JSON.stringify(updated, null, 2);

      await setContents({ contents: updatedStr, hasChanges: true }); // left JSON // new change 21
      setJson(updatedStr); // update graph // new change 22

      setIsEditMode(false);
      setEditedFields({});
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center"> {/* new change 23 */}
              {!isEditMode && (
                <Button size="xs" variant="filled" onClick={handleEdit}>
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditMode ? ( // new change 24
              <Stack>
                {/* single primitive value */}
                {nodeData?.text && nodeData.text.length === 1 && !nodeData.text[0].key ? (
                  <TextInput
                    label="value"
                    value={editedFields["__value"] ?? String(nodeData.text[0].value ?? "")}
                    onChange={e => setEditedFields(p => ({ ...p, __value: e.currentTarget.value }))}
                  />
                ) : (
                  // show only primitive key/value fields; hide arrays/objects
                  <Stack>
                    {nodeData?.text
                      ?.filter(row => row.key && row.type !== "object" && row.type !== "array")
                      .map(row => (
                        <TextInput
                          key={row.key}
                          label={row.key!}
                          value={editedFields[row.key!] ?? String(row.value ?? "")}
                          onChange={e =>
                            setEditedFields(prev => ({ ...prev, [row.key!]: e.currentTarget.value }))
                          }
                        />
                      ))}
                  </Stack>
                )}

                <Flex justify="flex-end" gap="sm">
                  <Button size="xs" color="gray" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button size="xs" color="green" onClick={handleSave} loading={saving}>
                    Save
                  </Button>
                </Flex>
              </Stack>
            ) : (
              <CodeHighlight
                code={previewContent} // new change 25
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>

        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};

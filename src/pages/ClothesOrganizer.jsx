import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ClothesOrganizer({ onLogout }) {
  const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5174/api";
  const getStoredUser = () => {
    try {
      return (
        JSON.parse(localStorage.getItem("user") || "null") ||
        JSON.parse(sessionStorage.getItem("user") || "null")
      );
    } catch {
      return null;
    }
  };
  const getToken = () =>
    localStorage.getItem("token") || sessionStorage.getItem("token");
  const makeId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now();
  const makeBlankItem = () => ({
    id: makeId(),
    name: "",
    category: categories[0] || "",
    status: "Washed",
    image: null,
  });
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({
    id: makeId(),
    name: "",
    category: "",
    status: "Washed",
    image: null,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const catMenuRef = useRef(null);
  const [user, setUser] = useState(() => getStoredUser());
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const statuses = ["All", "Washed", "Unwashed", "Lost/Unused"];

  const handleImageChange = (file) => {
    if (file) {
      setNewItem({ ...newItem, image: file });
      setPreview(URL.createObjectURL(file));
    }
  };

  // Upload image with progress using XMLHttpRequest. Returns {url, publicId} or null.
  const uploadImageIfNeeded = async (img) => {
    try {
      if (!img) return null;
      if (typeof img === "string") return img; // already a URL from server
      const token = getToken();
      const form = new FormData();
      form.append("image", img);
      setUploadProgress(0);
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/upload`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };
        xhr.onload = () => {
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              const data = JSON.parse(xhr.responseText || "{}");
              resolve({
                url: data.url || null,
                publicId: data.publicId || null,
              });
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          } catch (err) {
            reject(err);
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
      });
    } catch (e) {
      console.warn("Image upload failed, keeping local image only", e);
      return null;
    }
  };

  // Initial load from API with auth
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) {
        window.location.hash = "#/signin";
        return;
      }
      setUser(getStoredUser());
      try {
        const [itemsRes, catsRes] = await Promise.all([
          fetch(`${API_URL}/items`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/categories`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (itemsRes.status === 401 || catsRes.status === 401) {
          window.location.hash = "#/signin";
          return;
        }
        const [itemsDocs, catsDocs] = await Promise.all([
          itemsRes.ok ? itemsRes.json() : Promise.resolve([]),
          catsRes.ok ? catsRes.json() : Promise.resolve([]),
        ]);
        setItems(
          (itemsDocs || []).map((d) => ({
            id: d._id,
            name: d.name,
            category: d.category,
            status: d.status,
            image: d.imageUrl || null,
          }))
        );
        const serverCats = (catsDocs || []).map((c) => c.name);
        setCategories(serverCats);
      } catch (e) {
        console.warn("API load failed", e);
      }
    })();
  }, []);

  const handleAddItem = async () => {
    if (newItem.name.trim() === "") return;
    if (!newItem.category || newItem.category.trim() === "") return; // require a category
    if (isSaving) return; // guard against double clicks
    setIsSaving(true);
    if (editingIndex !== null) {
      const updated = [...items];
      // Update on server
      try {
        const token =
          localStorage.getItem("token") || sessionStorage.getItem("token");
        const uploaded = await uploadImageIfNeeded(newItem.image);
        const payload = {
          name: newItem.name,
          category: newItem.category,
          status: newItem.status,
          imageUrl:
            uploaded && uploaded.url
              ? uploaded.url
              : typeof newItem.image === "string"
              ? newItem.image
              : null,
          imagePublicId:
            uploaded && uploaded.publicId ? uploaded.publicId : undefined,
        };
        const id = updated[editingIndex].id;
        const res = await fetch(`${API_URL}/items/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const saved = await res.json();
          updated[editingIndex] = {
            id: saved._id,
            name: saved.name,
            category: saved.category,
            status: saved.status,
            image: saved.imageUrl || null,
          };
        } else {
          // fallback local update
          updated[editingIndex] = newItem;
        }
      } catch {
        updated[editingIndex] = newItem;
      }
      setItems(updated);
      setEditingIndex(null);
    } else {
      // Create on server
      let created = null;
      try {
        const token =
          localStorage.getItem("token") || sessionStorage.getItem("token");
        const uploaded = await uploadImageIfNeeded(newItem.image);
        const payload = {
          name: newItem.name,
          category: newItem.category,
          status: newItem.status,
          imageUrl:
            uploaded && uploaded.url
              ? uploaded.url
              : typeof newItem.image === "string"
              ? newItem.image
              : null,
          imagePublicId:
            uploaded && uploaded.publicId ? uploaded.publicId : undefined,
        };
        const res = await fetch(`${API_URL}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const saved = await res.json();
          created = {
            id: saved._id,
            name: saved.name,
            category: saved.category,
            status: saved.status,
            image: saved.imageUrl || null,
          };
        }
      } catch {}
      setItems([...items, created || { ...newItem, id: makeId() }]);
    }
    setNewItem(makeBlankItem());
    setPreview(null);
    setNewCategory("");
    setShowCatPicker(false);
    setIsModalOpen(false);
    setUploadProgress(0);
    setIsSaving(false);
  };

  const handleDelete = async (idToDelete) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      await fetch(`${API_URL}/items/${idToDelete}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}
    setItems((prev) => prev.filter((it) => it.id !== idToDelete));
  };

  const handleAddCategory = async () => {
    if (newCategory.trim() !== "" && !categories.includes(newCategory)) {
      try {
        const token = getToken();
        const res = await fetch(`${API_URL}/categories`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ name: newCategory }),
        });
        if (res.status === 401) {
          window.location.hash = "#/signin";
          return;
        }
        if (res.ok) {
          // Reload categories from server to ensure persistence
          const catsRes = await fetch(`${API_URL}/categories`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (catsRes.status === 401) {
            window.location.hash = "#/signin";
            return;
          }
          const cats = await catsRes.json();
          setCategories((cats || []).map((c) => c.name));
        } else {
          setCategories((prev) => Array.from(new Set([...prev, newCategory])));
        }
      } catch {
        setCategories((prev) => Array.from(new Set([...prev, newCategory])));
      }
      setNewCategory("");
    }
  };

  const handleDeleteCategory = async (cat) => {
    // Prevent deleting the last remaining category
    if (categories.length <= 1) {
      window.alert("At least one category is required.");
      return;
    }
    try {
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      await fetch(`${API_URL}/categories/${encodeURIComponent(cat)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Reload categories from server after delete
      const catsRes = await fetch(`${API_URL}/categories`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (catsRes.status === 401) {
        window.location.hash = "#/signin";
        return;
      }
      const cats = await catsRes.json();
      setCategories((cats || []).map((c) => c.name));
    } catch {}
    const updatedCats = categories.filter((c) => c !== cat);
    setCategories(updatedCats);
    // If the current draft item uses the removed category, switch it to the first available (or blank)
    if (newItem.category === cat) {
      setNewItem({ ...newItem, category: updatedCats[0] || "" });
    }
  };

  // Close the category dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!showCatPicker) return;
      if (catMenuRef.current && !catMenuRef.current.contains(e.target)) {
        setShowCatPicker(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showCatPicker]);

  // Normalize strings to lower-case and strip accents for robust matching
  const normalize = (s) =>
    (s ?? "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const matchesSearch = (item) => {
    const q = normalize(search).trim();
    if (!q) return true; // empty query matches all
    const haystack = normalize(`${item.name} ${item.category}`);
    // Support multi-word AND queries: all tokens must be present somewhere in name or category
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((t) => haystack.includes(t));
  };
  const filteredItems = (status) => {
    return items.filter(
      (item) =>
        (status === "All" || item.status === status) && matchesSearch(item)
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end text-sm mb-2 gap-3">
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1 rounded bg-red-100 text-red-700 border border-red-200 hover:bg-red-200"
              title="Log out"
            >
              Logout
            </button>
          )}
        </div>
        {user?.username && (
          <div className="text-lg font-semibold text-gray-700 mb-2">
            Hello, {user.username}
          </div>
        )}
        <input
          type="text"
          placeholder="Search by name or category..."
          className="w-full p-3 rounded-xl shadow-md border border-gray-300 mb-6"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {statuses.map((status, idx) => (
          <details key={status} open={status === "Washed"} className="mb-4">
            <summary className="cursor-pointer text-lg font-semibold text-gray-700 bg-white p-3 rounded-lg shadow">
              {status}
            </summary>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
              {filteredItems(status).map((item, index) => (
                <Card
                  key={item.id ?? index}
                  className="shadow-lg rounded-2xl overflow-hidden"
                >
                  <CardContent className="p-4 flex flex-col items-center">
                    {item.image && (
                      <img
                        src={
                          typeof item.image === "string"
                            ? item.image
                            : URL.createObjectURL(item.image)
                        }
                        alt={item.name}
                        className="w-24 h-24 object-cover rounded-lg mb-2"
                      />
                    )}
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="text-sm text-gray-500">{item.category}</p>
                    <div className="flex space-x-2 mt-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          setNewItem({ ...item });
                          if (item.image) {
                            setPreview(
                              typeof item.image === "string"
                                ? item.image
                                : URL.createObjectURL(item.image)
                            );
                          } else {
                            setPreview(null);
                          }
                          setIsModalOpen(true);
                          setEditingIndex(
                            items.findIndex((it) => it.id === item.id)
                          );
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </details>
        ))}

        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl w-96 shadow-lg relative">
              <h2 className="text-xl font-bold mb-4">
                {editingIndex !== null ? "Edit Item" : "Add New Item"}
              </h2>
              <input
                type="text"
                placeholder="Name"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
                className="w-full mb-3 p-2 border rounded-lg"
              />
              <div className="relative mb-3">
                <div className="flex flex-wrap items-start gap-2">
                  <select
                    value={newItem.category}
                    onChange={(e) =>
                      setNewItem({ ...newItem, category: e.target.value })
                    }
                    className="min-w-0 flex-1 p-2 border rounded-lg"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {/* Ensure the current value appears even if the category was removed */}
                    {!categories.includes(newItem.category) &&
                      newItem.category && (
                        <option value={newItem.category}>
                          {newItem.category}
                        </option>
                      )}
                    {categories.map((cat, i) => (
                      <option key={i} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="New category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="min-w-0 p-2 border rounded-lg flex-1"
                  />
                  <Button className="shrink-0" onClick={handleAddCategory}>
                    Add
                  </Button>
                  <Button
                    className="shrink-0"
                    variant="outline"
                    onClick={() => setShowCatPicker((v) => !v)}
                  >
                    Manage
                  </Button>
                </div>
                {showCatPicker && (
                  <div
                    ref={catMenuRef}
                    className="absolute right-0 mt-2 w-72 bg-white border rounded-xl shadow-lg p-3 z-50"
                    role="menu"
                    aria-label="Manage categories"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <div
                          key={cat}
                          className="flex items-center justify-between bg-gray-50 border rounded-lg px-2 py-1"
                        >
                          <span className="truncate" title={cat}>
                            {cat}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className={`text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed`}
                            disabled={categories.length <= 1}
                            title={`Delete ${cat}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <select
                value={newItem.status}
                onChange={(e) =>
                  setNewItem({ ...newItem, status: e.target.value })
                }
                className="w-full mb-3 p-2 border rounded-lg"
              >
                <option value="Washed">Washed</option>
                <option value="Unwashed">Unwashed</option>
                <option value="Lost/Unused">Lost/Unused</option>
              </select>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(e.target.files[0])}
                className="mb-3"
              />
              <div
                className={`w-full p-4 border-2 border-dashed rounded-lg text-center cursor-pointer mb-3 ${
                  dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleImageChange(e.dataTransfer.files[0]);
                }}
              >
                Drag & Drop Image or Click Below
              </div>
              {preview && (
                <div className="mb-3">
                  <img
                    src={preview}
                    alt="preview"
                    className="w-32 h-32 object-cover rounded-lg mb-2 mx-auto"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setPreview(null);
                      setNewItem({ ...newItem, image: null });
                    }}
                  >
                    Remove Image
                  </Button>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset draft state on cancel so inputs are cleared next time
                    setIsModalOpen(false);
                    setEditingIndex(null);
                    setNewCategory("");
                    setShowCatPicker(false);
                    setPreview(null);
                    setNewItem(makeBlankItem());
                    setDragActive(false);
                    setUploadProgress(0);
                    setIsSaving(false);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddItem} disabled={isSaving}>
                  {isSaving ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5 text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                      Uploading...
                    </span>
                  ) : editingIndex !== null ? (
                    "Save"
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Button
          className="fixed bottom-6 right-6 rounded-full shadow-lg p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
          onClick={() => {
            // Ensure a fresh form when opening Add
            setNewItem(makeBlankItem());
            setPreview(null);
            setEditingIndex(null);
            setIsModalOpen(true);
          }}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}

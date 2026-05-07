package org.localm.model;

public record ModrinthProject(
        String id,
        String slug,
        String title,
        String description,
        String author,
        long downloads,
        String iconUrl
) {
    /** Compact constructor with no icon / downloads (legacy compat) */
    public ModrinthProject(String id, String slug, String title, String description, String author) {
        this(id, slug, title, description, author, 0, null);
    }

    @Override
    public String toString() {
        return title;
    }
}

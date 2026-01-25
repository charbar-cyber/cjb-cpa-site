// Vercel Serverless Function: Get single blog post with all blocks from Notion

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const { id } = req.query;

    if (!NOTION_TOKEN) {
        return res.status(500).json({ error: 'Notion token not configured' });
    }

    if (!id) {
        return res.status(400).json({ error: 'Post ID is required' });
    }

    try {
        // Fetch the page properties
        const pageResponse = await fetch(`https://api.notion.com/v1/pages/${id}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
            },
        });

        if (!pageResponse.ok) {
            const errorData = await pageResponse.json();
            console.error('Notion API error (page):', errorData);
            return res.status(pageResponse.status).json({ error: 'Failed to fetch post from Notion' });
        }

        const page = await pageResponse.json();
        const properties = page.properties;

        // Extract page metadata
        const titleProp = properties.Name || properties.Title || properties.title;
        const title = titleProp?.title?.[0]?.plain_text || 'Untitled';

        const categoryProp = properties.Category || properties.category;
        const category = categoryProp?.select?.name || categoryProp?.multi_select?.[0]?.name || 'General';

        const dateProp = properties.Date || properties.date || properties['Publication Date'];
        const date = dateProp?.date?.start || page.created_time.split('T')[0];

        const cover = page.cover?.external?.url || page.cover?.file?.url || null;

        // Fetch all blocks (content) for the page
        const blocks = await fetchAllBlocks(id, NOTION_TOKEN);

        // Set cache headers
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

        return res.status(200).json({
            id: page.id,
            title,
            category,
            date,
            cover,
            blocks
        });

    } catch (error) {
        console.error('Error fetching post:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Recursively fetch all blocks, including children for toggle blocks
async function fetchAllBlocks(blockId, token) {
    const blocks = [];
    let cursor = undefined;

    do {
        const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
        if (cursor) {
            url.searchParams.set('start_cursor', cursor);
        }

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
            },
        });

        if (!response.ok) {
            console.error('Error fetching blocks:', await response.text());
            break;
        }

        const data = await response.json();

        for (const block of data.results) {
            // If the block has children (like toggle blocks), fetch them recursively
            if (block.has_children) {
                block.children = await fetchAllBlocks(block.id, token);
            }
            blocks.push(block);
        }

        cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    return blocks;
}

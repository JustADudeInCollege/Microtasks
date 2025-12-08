// src/routes/join/[token]/+page.server.ts
// Server-side logic for joining a workspace via share link

import type { PageServerLoad, Actions } from './$types';
import { adminDb } from '$lib/server/firebaseAdmin';
import { fail, redirect } from '@sveltejs/kit';
import type { WorkspaceShareLink, MemberRole } from '$lib/types/collaboration';
import { FieldValue } from 'firebase-admin/firestore';

const shareLinksCollection = adminDb.collection('workspace_share_links');
const workspaceMembersCollection = adminDb.collection('workspace_members');
const workspacesCollection = adminDb.collection('workspaces');

export const load: PageServerLoad = async ({ params, locals }) => {
    const { token } = params;
    const userId = locals.userId;

    try {
        // Fetch the share link
        const linkDoc = await shareLinksCollection.doc(token).get();
        
        if (!linkDoc.exists) {
            return {
                error: 'Invalid or expired link',
                linkNotFound: true
            };
        }

        const linkData = linkDoc.data() as WorkspaceShareLink;

        // Check if link is active
        if (!linkData.isActive) {
            return {
                error: 'This link has been deactivated',
                linkNotFound: true
            };
        }

        // Check if link has expired
        if (linkData.expiresAt && new Date(linkData.expiresAt) < new Date()) {
            return {
                error: 'This link has expired',
                linkExpired: true
            };
        }

        // Check usage limit
        if (linkData.usageLimit && linkData.usageCount >= linkData.usageLimit) {
            return {
                error: 'This link has reached its usage limit',
                linkExpired: true
            };
        }

        // Check if user is already a member
        let isAlreadyMember = false;
        if (userId) {
            const memberSnapshot = await workspaceMembersCollection
                .where('workspaceId', '==', linkData.workspaceId)
                .where('userId', '==', userId)
                .limit(1)
                .get();
            isAlreadyMember = !memberSnapshot.empty;
        }

        return {
            workspaceName: linkData.workspaceName,
            workspaceId: linkData.workspaceId,
            role: linkData.role,
            createdByUsername: linkData.createdByUsername,
            isLoggedIn: !!userId,
            isAlreadyMember,
            token
        };
    } catch (error: any) {
        console.error('[LOAD /join/[token]] Error:', error);
        return {
            error: 'Failed to load invitation details'
        };
    }
};

export const actions: Actions = {
    join: async ({ params, locals }) => {
        const { token } = params;
        const userId = locals.userId;

        if (!userId) {
            return fail(401, { error: 'You must be logged in to join a workspace' });
        }

        try {
            // Fetch and validate the share link
            const linkDoc = await shareLinksCollection.doc(token).get();
            
            if (!linkDoc.exists) {
                return fail(404, { error: 'Invalid or expired link' });
            }

            const linkData = linkDoc.data() as WorkspaceShareLink;

            // Validate link
            if (!linkData.isActive) {
                return fail(400, { error: 'This link has been deactivated' });
            }

            if (linkData.expiresAt && new Date(linkData.expiresAt) < new Date()) {
                return fail(400, { error: 'This link has expired' });
            }

            if (linkData.usageLimit && linkData.usageCount >= linkData.usageLimit) {
                return fail(400, { error: 'This link has reached its usage limit' });
            }

            // Check if already a member
            const memberSnapshot = await workspaceMembersCollection
                .where('workspaceId', '==', linkData.workspaceId)
                .where('userId', '==', userId)
                .limit(1)
                .get();

            if (!memberSnapshot.empty) {
                // Already a member, just redirect
                throw redirect(303, `/workspace/${linkData.workspaceId}`);
            }

            // Get user credentials
            const credDoc = await adminDb.collection('credentials').doc(userId).get();
            const userData = credDoc.data();
            const username = userData?.username || 'User';
            const email = userData?.email || '';

            // Create member record
            const memberData = {
                workspaceId: linkData.workspaceId,
                userId,
                username,
                email,
                role: linkData.role as MemberRole,
                joinedAt: new Date().toISOString(),
                invitedBy: linkData.createdBy, // The person who created the link
                joinedViaLink: token // Track that they joined via share link
            };

            await workspaceMembersCollection.add(memberData);

            // Increment usage count
            await shareLinksCollection.doc(token).update({
                usageCount: FieldValue.increment(1)
            });

            // Log activity
            await adminDb.collection('activity_log').add({
                workspaceId: linkData.workspaceId,
                userId,
                username,
                action: 'member_joined',
                details: `${username} joined via share link`,
                metadata: { joinedViaLink: true },
                createdAt: new Date().toISOString()
            });

            throw redirect(303, `/workspace/${linkData.workspaceId}`);
        } catch (error: any) {
            if (error.status === 303) throw error; // Re-throw redirects
            console.error('[ACTION join /join/[token]] Error:', error);
            return fail(500, { error: 'Failed to join workspace' });
        }
    }
};

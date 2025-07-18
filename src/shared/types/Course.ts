import { getCourseColors } from '@shared/util/colors';
import type { Serialized } from 'chrome-extension-toolkit';

import type { CourseMeeting } from './CourseMeeting';
import { CourseSchedule } from './CourseSchedule';
import Instructor from './Instructor';
import type { CourseColors } from './ThemeColors';

/**
 * Whether the class is taught online, in person, or a hybrid of the two
 */
export type InstructionMode = 'Online' | 'In Person' | 'Hybrid';

/**
 * The status of a course (e.g. open, closed, waitlisted, cancelled)
 */
export const Status = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    WAITLISTED: 'WAITLISTED',
    CANCELLED: 'CANCELLED',
} as const;

/**
 * Represents the type of status for a course.
 */
export type StatusType = (typeof Status)[keyof typeof Status];

/**
 * Represents a semester, with the year and the season for when a course is offered
 */
export type Semester = {
    /** The year that the semester is in */
    year: number;
    /** The season that the semester is in (Fall, Spring, Summer) */
    season: 'Fall' | 'Spring' | 'Summer';
    /** UT's code for the semester */
    code?: string;
};

/**
 * The internal representation of a course for the extension
 */
export class Course {
    /** Every course has a uniqueId within UT's registrar system corresponding to each course section */
    uniqueId!: number;
    /**
     * This is the course number for a course, i.e CS 314 would be 314, MAL 306H would be 306H.
     * UT prefixes summer courses with f, s, n, or w:
     * [f]irst term, [s]econd term, [n]ine week term, [w]hole term.
     * So, the first term of PSY 301 over the summer would be 'f301'
     */
    number!: string;
    /** The full name of the course, i.e. CS 314 Data Structures and Algorithms */
    fullName!: string;
    /** Just the english name for a course, without the number and department */
    courseName!: string;
    /** The unique identifier for which department that a course belongs to, i.e. CS, MAL, etc. */
    department!: string;

    /** The number of credits that a course is worth */
    creditHours!: number;
    /** Is the course open, closed, waitlisted, or cancelled? */
    status!: StatusType;
    /** all the people that are teaching this course, and some metadata about their names */
    instructors: Instructor[];
    /** Some courses at UT are reserved for certain groups of people or people within a certain major, which makes it difficult for people outside of that group to register for the course. */
    isReserved!: boolean;
    /** The description of the course as an array of "lines". This will include important information as well as a short summary of the topics covered */
    description?: string[];
    /** The schedule for the course, which includes the days of the week that the course is taught, the time that the course is taught, and the location that the course is taught */
    schedule: CourseSchedule;
    /** the link to the course details page for this course */
    url!: string;
    /** the link to the registration page for this course, for easy access when registering */
    registerURL?: string;
    /** At UT, some courses have certain "flags" which aid in graduation */
    flags!: string[];
    /** How is the class being taught (online, hybrid, in person, etc) */
    instructionMode!: InstructionMode;
    /** Which semester is the course from */
    semester!: Semester;
    /** Unix timestamp of when the course was last scraped */
    scrapedAt!: number;
    /** The colors of the course when displayed */
    colors: CourseColors;
    /** The core curriculum requirements the course satisfies */
    core: string[];

    constructor(course: Serialized<Course>) {
        Object.assign(this, course);
        this.schedule = new CourseSchedule(course.schedule);
        this.instructors = course.instructors.map(i => new Instructor(i));
        if (!course.scrapedAt) {
            this.scrapedAt = Date.now();
        }
        this.colors = course.colors ? structuredClone(course.colors) : getCourseColors('emerald', 500);
        this.core = course.core ?? [];
        if (course.semester.season === 'Summer') {
            // A bug from and old version put the summer term in the course,
            // so we need to handle that case
            const { department, number } = Course.cleanSummerTerm(course.department, course.number);
            this.department = department;
            this.number = number;
        }
    }

    /**
     * Due to a bug in an older version, the summer term was included in the course department code,
     * instead of the course number.
     * UT prefixes summer courses with f, s, n, or w:
     * [f]irst term, [s]econd term, [n]ine week term, [w]hole term
     *
     * @param department - The course department code, like 'C S'
     * @param number - The course number, like '314H'
     * @returns The properly formatted department and course number
     * @example
     * ```ts
     * cleanSummerTerm('C S',  '314H') // { department: 'C S', number: '314H' }
     * cleanSummerTerm('P R',  'f378') // { department: 'P R', number: 'f378' }
     * cleanSummerTerm('P R f', '378') // { department: 'P R', number: 'f378' }
     * cleanSummerTerm('P S',  'n303') // { department: 'P S', number: 'n303' }
     * cleanSummerTerm('P S n', '303') // { department: 'P S', number: 'n303' }
     * ```
     */
    static cleanSummerTerm(department: string, number: string): { department: string; number: string } {
        // UT prefixes summer courses with f, s, n, or w:
        // [f]irst term, [s]econd term, [n]ine week term, [w]hole term
        const summerTerm = department.match(/[fsnw]$/);

        if (!summerTerm) {
            return { department, number };
        }

        return {
            department: department.slice(0, -1).trim(),
            number: summerTerm[0] + number,
        };
    }

    /**
     * Gets a list of all the conflicts between this course and another course (i.e. if they have a meeting at the same time)
     *
     * @param other - Another course to compare this course to
     * @returns A list of all the conflicts between this course and the other course as a tuple of the two conflicting meetings
     */
    getConflicts(other: Course): [CourseMeeting, CourseMeeting][] {
        const conflicts: [CourseMeeting, CourseMeeting][] = [];
        for (const meeting of this.schedule.meetings) {
            for (const otherMeeting of other.schedule.meetings) {
                if (meeting.isConflicting(otherMeeting)) {
                    conflicts.push([meeting, otherMeeting]);
                }
            }
        }

        return conflicts;
    }

    /**
     * @returns The course number without the summer term
     * @example
     * ```ts
     * const c = new Course({ number: 'f301', ... });
     * c.getNumberWithoutTerm() // '301'
     * ```
     */
    getNumberWithoutTerm(): string {
        return this.number.replace(/^\D/, ''); // Remove nondigit at start, if it exists
    }
}

/**
 * A helper type that is used to represent an element in the DOM, with the actual element corresponding to the course object
 */
export type ScrapedRow = {
    element: HTMLTableRowElement;
    course: Course | null;
};
